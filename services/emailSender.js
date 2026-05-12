import axios from "axios";
import { google } from "googleapis";
import { getUser, saveUser } from "../db/store.js";
import { sendCustomEmail } from "./customMail.js";

const MAX_ATTACHMENTS = 3;
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024; 

function normalizeEmailList(value = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emailHeadersFor(recipients = {}) {
  const cc = normalizeEmailList(recipients.cc);
  const bcc = normalizeEmailList(recipients.bcc);
  return { cc, bcc };
}

export async function ensureMicrosoftAccessToken(userId) {
  const user = await getUser(userId);
  if (!user || !user.microsoft_refresh_token) {
    throw new Error("Microsoft not connected. Please /connect-email again.");
  }

  const now = Date.now();
  if (
    user.microsoft_access_token &&
    user.microsoft_expires_at &&
    user.microsoft_expires_at > now + 60_000
  ) {
    return user.microsoft_access_token;
  }

  const resp = await axios.post(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.microsoft_refresh_token,
      scope: "https://graph.microsoft.com/.default offline_access",
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token, refresh_token, expires_in } = resp.data;
  const updated = {
    ...user,
    microsoft_access_token: access_token,
    microsoft_refresh_token: refresh_token || user.microsoft_refresh_token,
    microsoft_expires_at: Date.now() + expires_in * 1000,
    microsoft_provider: "microsoft",
  };
  await saveUser(userId, updated);
  return updated.microsoft_access_token;
}

async function fetchAttachments(urls = []) {
  const safeUrls = urls.slice(0, MAX_ATTACHMENTS);
  const attachments = [];

  for (const url of safeUrls) {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    const buf = Buffer.from(res.data);
    if (buf.length > MAX_BYTES_PER_FILE) {
      throw new Error(`Attachment too large (>5MB): ${url}`);
    }
    const contentType = res.headers["content-type"] || "application/octet-stream";
    const filename = decodeURIComponent(url.split("/").pop() || "file.bin");
    attachments.push({ filename, mimeType: contentType, base64: buf.toString("base64") });
  }

  return attachments;
}

export async function sendEmailViaGoogle(
  userId,
  recipientEmail,
  subject,
  body,
  attachmentUrls = [],
  recipients = {}
) {
  console.log(`📧 Starting Google email send to ${recipientEmail}`);
  
  const user = await getUser(userId);
  if (!user || !user.google_tokens) {
    throw new Error("Google tokens not found. Please connect Gmail first.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(user.google_tokens);
  
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const attachments = await fetchAttachments(attachmentUrls);
  const { cc, bcc } = emailHeadersFor(recipients);

  // If no attachments, keep simple text path
  if (!attachments.length) {
    const message = [
      "From: me",
      `To: ${recipientEmail}`,
      ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
      ...(bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log(`✅ Gmail email sent successfully. Message ID: ${response.data.id}`);
      return {
        success: true,
        messageId: response.data.id,
        provider: "Gmail",
      };
    } catch (err) {
      console.error(`❌ Gmail API error: ${err.message}`);
      throw new Error(`Gmail error: ${err.message}`);
    }
  }

  // Multipart with attachments
  const boundary = "mixed_" + Date.now();
  const lines = [
    "From: me",
    `To: ${recipientEmail}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ];

  attachments.forEach((att) => {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}`,
      `Content-Disposition: attachment; filename=\"${att.filename}\"`,
      "Content-Transfer-Encoding: base64",
      "",
      att.base64
    );
  });

  lines.push(`--${boundary}--`, "");

  const encodedMessage = Buffer.from(lines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });
    
    console.log(`✅ Gmail email sent successfully. Message ID: ${response.data.id}`);
    return {
      success: true,
      messageId: response.data.id,
      provider: "Gmail",
    };
  } catch (err) {
    console.error(`❌ Gmail API error: ${err.message}`);
    throw new Error(`Gmail error: ${err.message}`);
  }
}

export async function sendEmailViaOutlook(
  userId,
  recipientEmail,
  subject,
  body,
  attachmentUrls = [],
  recipients = {}
) {
  console.log(`📧 Starting Outlook email send to ${recipientEmail}`);
  
  const msToken = await ensureMicrosoftAccessToken(userId);

  try {
    const attachments = await fetchAttachments(attachmentUrls);
    const { cc, bcc } = emailHeadersFor(recipients);

    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        message: {
          subject: subject,
          body: {
            contentType: "Text",
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
              },
            },
          ],
          ccRecipients: cc.map((address) => ({
            emailAddress: { address },
          })),
          bccRecipients: bcc.map((address) => ({
            emailAddress: { address },
          })),
          attachments: attachments.map((att) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.filename,
            contentType: att.mimeType,
            contentBytes: att.base64,
          })),
        },
        saveToSentItems: true,
      },
      {
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Outlook email sent successfully. Status: ${response.status}`);
    return {
      success: true,
      status: response.status,
      provider: "Outlook",
    };
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error(`❌ Outlook API error: ${errorMsg}`);
    
    // Check if token is expired
    if (err.response?.status === 401) {
      throw new Error("Outlook token expired. Please reconnect with `/connect-email`");
    }
    
    throw new Error(`Outlook error: ${errorMsg}`);
  }
}

export async function sendEmail(
  userId,
  provider,
  recipientEmail,
  subject,
  body,
  attachmentUrls = [],
  recipients = {}
) {
  console.log(`\n🚀 sendEmail called: provider=${provider}, recipient=${recipientEmail}`);
  
  if (provider === "google") {
    return await sendEmailViaGoogle(userId, recipientEmail, subject, body, attachmentUrls, recipients);
  } else if (provider === "microsoft") {
    return await sendEmailViaOutlook(userId, recipientEmail, subject, body, attachmentUrls, recipients);
  } else if (provider === "custom" || provider === "imap") {
    if (attachmentUrls.length) {
      throw new Error("Custom SMTP sending does not support URL attachments yet.");
    }
    return await sendCustomEmail(userId, recipientEmail, subject, body, recipients);
  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }
}
