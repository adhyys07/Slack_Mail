import axios from "axios";
import Imap from "imap";
import { google } from "googleapis";
import { getUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { ensureMicrosoftAccessToken } from "./emailSender.js";

const DEFAULT_LIMIT = 5;

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase();
  if (["google", "gmail"].includes(value)) return "google";
  if (["microsoft", "outlook"].includes(value)) return "microsoft";
  if (["custom", "imap"].includes(value)) return "custom";
  return "";
}

function createCustomImap(config) {
  return new Imap({
    user: config.username,
    password: config.password,
    host: config.imapHost,
    port: config.imapPort || 993,
    tls: config.imapTls !== false,
    authTimeout: 10000,
    tlsOptions: { rejectUnauthorized: false },
  });
}

async function getCustomConfig(userId) {
  const user = await getUser(userId);
  if (!user?.custom_mail) throw new Error("Custom email is not connected.");
  return user.custom_mail;
}

async function getGmail(userId) {
  const auth = await getGoogleTokens(userId);
  return google.gmail({ version: "v1", auth });
}

function graphHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function flattenBoxes(boxes, prefix = "") {
  const names = [];
  for (const [name, box] of Object.entries(boxes || {})) {
    const fullName = prefix ? `${prefix}${box.delimiter || "/"}${name}` : name;
    names.push(fullName);
    names.push(...flattenBoxes(box.children, fullName));
  }
  return names;
}

function findFolderName(folders, candidates) {
  const lowered = folders.map((folder) => ({ folder, key: folder.toLowerCase() }));
  for (const candidate of candidates) {
    const target = candidate.toLowerCase();
    const exact = lowered.find((item) => item.key === target);
    if (exact) return exact.folder;
    const suffix = lowered.find((item) => item.key.endsWith(`/${target}`) || item.key.endsWith(`.${target}`));
    if (suffix) return suffix.folder;
  }
  return candidates[0];
}

function customConnection(config) {
  return new Promise((resolve, reject) => {
    const imap = createCustomImap(config);
    imap.once("error", reject);
    imap.once("ready", () => resolve(imap));
    imap.connect();
  });
}

async function withCustomImap(userId, fn) {
  const config = await getCustomConfig(userId);
  const imap = await customConnection(config);
  try {
    return await fn(imap);
  } finally {
    try {
      imap.end();
    } catch {
      // Connection may already be closed.
    }
  }
}

function openBox(imap, mailbox, readOnly = false) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox, readOnly, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function getBoxes(imap) {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => (err ? reject(err) : resolve(boxes)));
  });
}

function addBox(imap, mailbox) {
  return new Promise((resolve) => {
    imap.addBox(mailbox, () => resolve());
  });
}

function moveUid(imap, uid, mailbox) {
  return new Promise((resolve, reject) => {
    imap.move(uid, mailbox, (err) => (err ? reject(err) : resolve()));
  });
}

function updateCustomFlag(userId, uid, flag, enabled) {
  return withCustomImap(userId, async (imap) => {
    await openBox(imap, "INBOX", false);
    return new Promise((resolve, reject) => {
      const action = enabled ? "addFlags" : "delFlags";
      imap[action](uid, flag, (err) => (err ? reject(err) : resolve({ success: true })));
    });
  });
}

async function resolveCustomFolder(imap, candidates) {
  const boxes = await getBoxes(imap);
  return findFolderName(flattenBoxes(boxes), candidates);
}

async function moveCustomEmail(userId, uid, folderName, createIfMissing = true) {
  return withCustomImap(userId, async (imap) => {
    await openBox(imap, "INBOX", false);
    if (createIfMissing) await addBox(imap, folderName);
    await moveUid(imap, uid, folderName);
    return { success: true, provider: "Custom", folder: folderName };
  });
}

async function moveCustomToResolvedFolder(userId, uid, candidates) {
  return withCustomImap(userId, async (imap) => {
    const folder = await resolveCustomFolder(imap, candidates);
    await addBox(imap, folder);
    await openBox(imap, "INBOX", false);
    await moveUid(imap, uid, folder);
    return { success: true, provider: "Custom", folder };
  });
}

function customHeaderSummary(header = "", uid = "") {
  const parsed = Imap.parseHeader(header);
  return {
    id: uid,
    uid,
    from: parsed.from?.[0] || "Unknown",
    subject: parsed.subject?.[0] || "No Subject",
    date: parsed.date?.[0] || "",
  };
}

async function listCustomMessages(userId, mailbox, criteria, limit = DEFAULT_LIMIT) {
  return withCustomImap(userId, async (imap) => {
    await openBox(imap, mailbox, true);
    const ids = await new Promise((resolve, reject) => {
      imap.search(criteria, (err, results = []) => (err ? reject(err) : resolve(results.slice(-limit).reverse())));
    });
    if (!ids.length) return [];

    return new Promise((resolve, reject) => {
      const messages = [];
      const fetcher = imap.fetch(ids, { bodies: "HEADER.FIELDS (FROM SUBJECT DATE)" });

      fetcher.on("message", (msg) => {
        let header = "";
        let uid = "";
        msg.on("body", (stream) => {
          stream.on("data", (chunk) => {
            header += chunk.toString("utf8");
          });
        });
        msg.once("attributes", (attrs) => {
          uid = attrs.uid;
        });
        msg.once("end", () => {
          messages.push(customHeaderSummary(header, uid));
        });
      });

      fetcher.once("error", reject);
      fetcher.once("end", () => resolve(messages));
    });
  });
}

async function gmailLabelId(gmail, labelName, createIfMissing = true) {
  const normalizedName = String(labelName || "").trim();
  if (!normalizedName) throw new Error("Missing Gmail label.");

  const systemLabel = normalizedName.toUpperCase().replace(/\s+/g, "_");
  const systemLabels = new Set(["INBOX", "STARRED", "TRASH", "SPAM", "IMPORTANT", "SENT", "DRAFT"]);
  if (systemLabels.has(systemLabel)) return systemLabel;

  const labels = await gmail.users.labels.list({ userId: "me" });
  const existing = (labels.data.labels || []).find(
    (label) => label.name.toLowerCase() === normalizedName.toLowerCase()
  );
  if (existing) return existing.id;
  if (!createIfMissing) throw new Error(`Gmail label not found: ${normalizedName}`);

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: normalizedName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return created.data.id;
}

async function listGmailSummaries(userId, query, limit = DEFAULT_LIMIT) {
  const gmail = await getGmail(userId);
  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: limit });
  const messages = list.data.messages || [];
  const summaries = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = detail.data.payload?.headers || [];
    summaries.push({
      id: msg.id,
      from: headers.find((h) => h.name === "From")?.value || "Unknown",
      subject: headers.find((h) => h.name === "Subject")?.value || "No Subject",
      date: headers.find((h) => h.name === "Date")?.value || "",
    });
  }

  return summaries;
}

async function listOutlookSummaries(userId, url) {
  const accessToken = await ensureMicrosoftAccessToken(userId);
  const resp = await axios.get(url, { headers: graphHeaders(accessToken) });
  return (resp.data.value || []).map((msg) => ({
    id: msg.id,
    from: msg.from?.emailAddress?.address || "Unknown",
    subject: msg.subject || "No Subject",
    date: msg.receivedDateTime || "",
  }));
}

async function resolveOutlookFolderId(accessToken, folderName) {
  const normalized = String(folderName || "").trim();
  if (!normalized) throw new Error("Missing Outlook folder.");

  const known = {
    inbox: "inbox",
    archive: "archive",
    drafts: "drafts",
    sent: "sentitems",
    sentitems: "sentitems",
    trash: "deleteditems",
    deleted: "deleteditems",
    deleteditems: "deleteditems",
    junk: "junkemail",
    junkemail: "junkemail",
  };

  const key = normalized.toLowerCase().replace(/\s+/g, "");
  if (known[key]) return known[key];

  const resp = await axios.get(
    `https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&$select=id,displayName`,
    { headers: graphHeaders(accessToken) }
  );
  const folder = (resp.data.value || []).find(
    (item) => item.displayName?.toLowerCase() === normalized.toLowerCase()
  );
  if (!folder) throw new Error(`Outlook folder not found: ${normalized}`);
  return folder.id;
}

export async function starEmail(userId, provider, messageIdOrUid) {
  const normalized = normalizeProvider(provider);
  if (!messageIdOrUid) throw new Error("Missing message ID or UID.");

  if (normalized === "google") {
    const gmail = await getGmail(userId);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: { addLabelIds: ["STARRED"] },
    });
    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}`,
      { flag: { flagStatus: "flagged" } },
      { headers: graphHeaders(accessToken) }
    );
    return { success: true, provider: "Outlook" };
  }

  if (normalized === "custom") {
    await updateCustomFlag(userId, messageIdOrUid, "\\Flagged", true);
    return { success: true, provider: "Custom" };
  }

  throw new Error("Unknown provider.");
}

export async function unstarEmail(userId, provider, messageIdOrUid) {
  const normalized = normalizeProvider(provider);
  if (!messageIdOrUid) throw new Error("Missing message ID or UID.");

  if (normalized === "google") {
    const gmail = await getGmail(userId);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: { removeLabelIds: ["STARRED"] },
    });
    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}`,
      { flag: { flagStatus: "notFlagged" } },
      { headers: graphHeaders(accessToken) }
    );
    return { success: true, provider: "Outlook" };
  }

  if (normalized === "custom") {
    await updateCustomFlag(userId, messageIdOrUid, "\\Flagged", false);
    return { success: true, provider: "Custom" };
  }

  throw new Error("Unknown provider.");
}

export async function archiveEmail(userId, provider, messageIdOrUid) {
  const normalized = normalizeProvider(provider);
  if (!messageIdOrUid) throw new Error("Missing message ID or UID.");

  if (normalized === "google") {
    const gmail = await getGmail(userId);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}/move`,
      { destinationId: "archive" },
      { headers: graphHeaders(accessToken) }
    );
    return { success: true, provider: "Outlook" };
  }

  if (normalized === "custom") {
    return moveCustomToResolvedFolder(userId, messageIdOrUid, ["Archive", "Archives"]);
  }

  throw new Error("Unknown provider.");
}

export async function deleteEmail(userId, provider, messageIdOrUid) {
  const normalized = normalizeProvider(provider);
  if (!messageIdOrUid) throw new Error("Missing message ID or UID.");

  if (normalized === "google") {
    const gmail = await getGmail(userId);
    await gmail.users.messages.trash({ userId: "me", id: messageIdOrUid });
    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    await axios.delete(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}`,
      { headers: graphHeaders(accessToken) }
    );
    return { success: true, provider: "Outlook" };
  }

  if (normalized === "custom") {
    return moveCustomToResolvedFolder(userId, messageIdOrUid, ["Trash", "Deleted Items", "Deleted", "INBOX.Trash"]);
  }

  throw new Error("Unknown provider.");
}

export async function moveEmail(userId, provider, messageIdOrUid, destination) {
  const normalized = normalizeProvider(provider);
  if (!messageIdOrUid) throw new Error("Missing message ID or UID.");
  if (!destination) throw new Error("Missing destination folder or label.");

  if (normalized === "google") {
    const gmail = await getGmail(userId);
    const labelId = await gmailLabelId(gmail, destination, true);
    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ["INBOX"],
      },
    });
    return { success: true, provider: "Gmail", destination };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    const destinationId = await resolveOutlookFolderId(accessToken, destination);
    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}/move`,
      { destinationId },
      { headers: graphHeaders(accessToken) }
    );
    return { success: true, provider: "Outlook", destination };
  }

  if (normalized === "custom") {
    return moveCustomEmail(userId, messageIdOrUid, destination, true);
  }

  throw new Error("Unknown provider.");
}

export async function listStarredEmails(userId, provider, limit = DEFAULT_LIMIT) {
  const normalized = normalizeProvider(provider);

  if (normalized === "google") {
    return { provider: "Gmail", messages: await listGmailSummaries(userId, "is:starred", limit) };
  }

  if (normalized === "microsoft") {
    const url = `https://graph.microsoft.com/v1.0/me/messages?$top=${limit}&$filter=flag/flagStatus%20eq%20'flagged'&$select=id,from,subject,receivedDateTime&$orderby=receivedDateTime desc`;
    return { provider: "Outlook", messages: await listOutlookSummaries(userId, url) };
  }

  if (normalized === "custom") {
    return { provider: "Custom", messages: await listCustomMessages(userId, "INBOX", ["FLAGGED"], limit) };
  }

  throw new Error("Unknown provider.");
}

export async function listArchivedEmails(userId, provider, limit = DEFAULT_LIMIT) {
  const normalized = normalizeProvider(provider);

  if (normalized === "google") {
    const query = "in:all -in:inbox -in:trash -in:spam";
    return { provider: "Gmail", messages: await listGmailSummaries(userId, query, limit) };
  }

  if (normalized === "microsoft") {
    const url = `https://graph.microsoft.com/v1.0/me/mailFolders/archive/messages?$top=${limit}&$select=id,from,subject,receivedDateTime&$orderby=receivedDateTime desc`;
    return { provider: "Outlook", messages: await listOutlookSummaries(userId, url) };
  }

  if (normalized === "custom") {
    const config = await getCustomConfig(userId);
    const imap = await customConnection(config);
    try {
      const folder = await resolveCustomFolder(imap, ["Archive", "Archives"]);
      imap.end();
      return { provider: "Custom", messages: await listCustomMessages(userId, folder, ["ALL"], limit) };
    } catch (err) {
      imap.end();
      throw err;
    }
  }

  throw new Error("Unknown provider.");
}
