import { google } from "googleapis";

export async function listGmailEmails(tokens, limit = 10) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth });

  // STEP 1: List messages (IDs only)
  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: limit,
  });

  if (!listRes.data.messages || listRes.data.messages.length === 0) {
    return [];
  }

  const emails = [];

  // STEP 2: Fetch metadata for each message
  for (const msg of listRes.data.messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const headers = detail.data.payload.headers || [];

    const getHeader = (name) =>
      headers.find((h) => h.name === name)?.value || "(unknown)";

    emails.push({
      subject: getHeader("Subject"),
      from: getHeader("From"),
      date: getHeader("Date"),
    });
  }

  return emails;
}
