import { google } from "googleapis";

export async function listGmailEmails(tokens, limit = 10) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth });

  // STEP 1: Get message IDs (no filters)
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: limit,
  });

  console.log("[GMAIL] LIST:", listRes.data);

  if (!listRes.data.messages) return [];

  const emails = [];

  // STEP 2: Fetch headers for each email
  for (const msg of listRes.data.messages) {
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const headers = msgRes.data.payload.headers;
    const get = (name) =>
      headers.find((h) => h.name === name)?.value || "";

    emails.push({
      subject: get("Subject"),
      from: get("From"),
      date: get("Date"),
    });
  }

  return emails;
}
