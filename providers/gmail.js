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

    const fullMessages = await Promise.all(
        messages.map(async (m) => {
            const res = await gmail.users.messages.get({
                userId: "me",
                id: m.id,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
            });
            return res.data;
        })
    );

    return fullMessages.map((msg) => {
        const headers = msg.payload?.headers || [];
        const get = (name) =>
            headers.find(h => h.name === name)?.value || "Unknown";

        return {
            from: get("From"),
            subject: get("Subject"),
            date: get("Date"),
        };
    });
}
