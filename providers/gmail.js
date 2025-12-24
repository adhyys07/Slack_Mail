import { google } from "googleapis";

export async function listGmailEmails(tokens) {
    if (!tokens) return [];

    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth });

    const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: 6,
        q: "is:inbox",
    });

    const messages = listRes.data.messages || [];
    if (!messages.length) return [];

    const full = await Promise.all(
        messages.map(async (m) => {
            const res = await gmail.users.messages.get({
                userId: "me",
                id: m.id,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
            });

            const headers = res.data.payload?.headers || [];
            const get = (n) =>
                headers.find(h => h.name === n)?.value || "Unknown";

            return {
                from: get("From"),
                subject: get("Subject"),
                date: get("Date"),
            };
        })
    );

    return full;
}
