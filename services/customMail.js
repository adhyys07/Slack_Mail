import Imap from "imap";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { getUser } from "../db/store.js";

const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SMTP_PORT = 465;

function normalizeEmailList(value = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAddress(value) {
  return value?.value?.[0]?.address || value?.text || "";
}

function normalizePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export function normalizeCustomMailConfig(input = {}) {
  const email = String(input.email || "").trim();
  const username = String(input.username || email).trim();
  const password = String(input.password || "");
  const imapHost = String(input.imapHost || "").trim();
  const smtpHost = String(input.smtpHost || "").trim();
  const imapPort = normalizePort(input.imapPort, DEFAULT_IMAP_PORT);
  const smtpPort = normalizePort(input.smtpPort, DEFAULT_SMTP_PORT);
  const imapTls = input.imapTls === undefined ? imapPort === DEFAULT_IMAP_PORT : input.imapTls !== false;
  const smtpSecure = input.smtpSecure === undefined ? smtpPort === DEFAULT_SMTP_PORT : input.smtpSecure !== false;

  if (!email || !username || !password || !imapHost || !smtpHost) {
    throw new Error("Email, username, password, IMAP host, and SMTP host are required.");
  }

  return {
    email,
    username,
    password,
    imapHost,
    imapPort,
    imapTls,
    smtpHost,
    smtpPort,
    smtpSecure,
  };
}

async function getCustomMailConfig(userId) {
  const user = await getUser(userId);
  if (!user?.custom_mail) {
    throw new Error("Custom email is not connected. Use `/connect-email` first.");
  }
  return user.custom_mail;
}

function createImap(config) {
  return new Imap({
    user: config.username,
    password: config.password,
    host: config.imapHost,
    port: config.imapPort || DEFAULT_IMAP_PORT,
    tls: config.imapTls !== false,
    authTimeout: 10000,
    tlsOptions: { rejectUnauthorized: false },
  });
}

function fetchParsedMessages(config, criteria, limit = 5) {
  return new Promise((resolve, reject) => {
    const imap = createImap(config);
    let settled = false;

    const done = (err, value) => {
      if (settled) return;
      settled = true;
      try {
        imap.end();
      } catch {
        // Connection may already be closed.
      }
      err ? reject(err) : resolve(value);
    };

    imap.once("error", (err) => done(err));
    imap.once("ready", () => {
      imap.openBox("INBOX", true, (openErr) => {
        if (openErr) return done(openErr);

        imap.search(criteria, (searchErr, results = []) => {
          if (searchErr) return done(searchErr);

          const ids = results.slice(-limit).reverse();
          if (!ids.length) return done(null, []);

          const messages = [];
          const pendingParses = [];
          const fetcher = imap.fetch(ids, { bodies: "", struct: true });

          fetcher.on("message", (msg, seqno) => {
            let raw = "";
            const attrs = {};

            msg.on("body", (stream) => {
              stream.on("data", (chunk) => {
                raw += chunk.toString("utf8");
              });
            });

            msg.once("attributes", (data) => {
              Object.assign(attrs, data);
            });

            msg.once("end", () => {
              pendingParses.push((async () => {
                try {
                  const parsed = await simpleParser(raw);
                  messages.push({
                    seqno,
                    uid: attrs.uid,
                    messageId: parsed.messageId,
                    inReplyTo: parsed.inReplyTo,
                    references: parsed.references,
                    subject: parsed.subject || "No Subject",
                    from: parsed.from?.text || "Unknown",
                    fromEmail: getAddress(parsed.from),
                    replyTo: getAddress(parsed.replyTo),
                    date: parsed.date?.toISOString?.() || "",
                    text: parsed.text || "",
                    html: parsed.html || "",
                  });
                } catch (parseErr) {
                  messages.push({
                    seqno,
                    uid: attrs.uid,
                    subject: "Unable to parse message",
                    from: "Unknown",
                    text: parseErr.message,
                  });
                }
              })());
            });
          });

          fetcher.once("error", (fetchErr) => done(fetchErr));
          fetcher.once("end", async () => {
            await Promise.all(pendingParses);
            messages.sort((a, b) => ids.indexOf(a.seqno) - ids.indexOf(b.seqno));
            done(null, messages);
          });
        });
      });
    });

    imap.connect();
  });
}

export async function testCustomInboxConnection(config) {
  const normalized = normalizeCustomMailConfig(config);
  await fetchParsedMessages(normalized, ["ALL"], 1);
  return normalized;
}

export async function listCustomEmails(userId, limit = 5) {
  const config = await getCustomMailConfig(userId);
  return fetchParsedMessages(config, ["ALL"], limit);
}

export async function openCustomEmail(userId, index = 1) {
  const messages = await listCustomEmails(userId, 5);
  return messages[index - 1] || null;
}

export async function searchCustomEmails(userId, query, limit = 5) {
  const config = await getCustomMailConfig(userId);
  return fetchParsedMessages(config, [["TEXT", query]], limit);
}

export async function sendCustomEmail(userId, recipientEmail, subject, body, recipients = {}) {
  const config = await getCustomMailConfig(userId);
  const cc = normalizeEmailList(recipients.cc);
  const bcc = normalizeEmailList(recipients.bcc);
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || DEFAULT_SMTP_PORT,
    secure: config.smtpSecure !== false,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  const info = await transporter.sendMail({
    from: config.email,
    to: recipientEmail,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    subject,
    text: body,
  });

  return {
    success: true,
    messageId: info.messageId,
    provider: "Custom",
  };
}
