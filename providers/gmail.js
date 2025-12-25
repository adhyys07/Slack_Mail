import { google } from "googleapis";

export async function listGmailEmails(tokens, limit = 10) {
  // Create OAuth client
  const auth = new google.auth.OAuth2();
  auth.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth });

  // 🔑 IMPORTANT: do NOT restrict to inbox only
  // This fetches ALL recent emails (read + unread)
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: limit,
    q: "-in:spam -in:trash", // safest query
  });

  console.log("[gmail] list response:", listRes.data);

  const messages = listRes.data.messages;
  if (!messages || messages.length === 0) {
    return [];
  }

  const emails = [];

  for (const msg of messages) {
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = msgRes.data.payload?.headers || [];

    const getHeader = (name) =>
      headers.find((h) => h.name === name)?.value || "Unknown";

    emails.push({
      id: msg.id,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      date: getHeader("Date"),
    });
  }

  return emails;
}
