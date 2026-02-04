import { google } from "googleapis";
import { getGoogleTokens, deleteTokens } from "./googleTokens.js";

export async function fetchGmail(userId) {
  const auth = await getGoogleTokens(userId);

  const gmail = google.gmail({ version: "v1", auth });

  const list = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread category:primary",
    maxResults: 5,
  });

  if (!list.data.messages) return [];

  const emails = [];

  for (const msg of list.data.messages) {
    const data = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
    });

    const headers = data.data.payload.headers;

    emails.push({
      subject: headers.find(h => h.name === "Subject")?.value || "No subject",
      from: headers.find(h => h.name === "From")?.value || "Unknown",
    });
  }

  return emails;
}

export async function disconnectGmail(userId) {
  await deleteTokens(userId);
}
