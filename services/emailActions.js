import axios from "axios";
import Imap from "imap";
import { google } from "googleapis";
import { getUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { ensureMicrosoftAccessToken } from "./emailSender.js";

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

async function updateCustomFlag(userId, uid, flag, enabled) {
  const user = await getUser(userId);
  if (!user?.custom_mail) {
    throw new Error("Custom email is not connected.");
  }

  return new Promise((resolve, reject) => {
    const imap = createCustomImap(user.custom_mail);

    imap.once("error", reject);
    imap.once("ready", () => {
      imap.openBox("INBOX", false, (openErr) => {
        if (openErr) return reject(openErr);

        const done = (err) => {
          imap.end();
          err ? reject(err) : resolve({ success: true });
        };

        const action = enabled ? "addFlags" : "delFlags";
        imap[action](uid, flag, done);
      });
    });

    imap.connect();
  });
}

export async function starEmail(userId, provider, messageIdOrUid) {
  const normalized = normalizeProvider(provider);

  if (!messageIdOrUid) {
    throw new Error("Missing message ID or UID.");
  }

  if (normalized === "google") {
    const auth = await getGoogleTokens(userId);
    const gmail = google.gmail({ version: "v1", auth });

    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: {
        addLabelIds: ["STARRED"],
      },
    });

    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);

    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}`,
      {
        flag: {
          flagStatus: "flagged",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
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

  if (!messageIdOrUid) {
    throw new Error("Missing message ID or UID.");
  }

  if (normalized === "google") {
    const auth = await getGoogleTokens(userId);
    const gmail = google.gmail({ version: "v1", auth });

    await gmail.users.messages.modify({
      userId: "me",
      id: messageIdOrUid,
      requestBody: {
        removeLabelIds: ["STARRED"],
      },
    });

    return { success: true, provider: "Gmail" };
  }

  if (normalized === "microsoft") {
    const accessToken = await ensureMicrosoftAccessToken(userId);

    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageIdOrUid)}`,
      {
        flag: {
          flagStatus: "notFlagged",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { success: true, provider: "Outlook" };
  }

  if (normalized === "custom") {
    await updateCustomFlag(userId, messageIdOrUid, "\\Flagged", false);
    return { success: true, provider: "Custom" };
  }

  throw new Error("Unknown provider.");
}
