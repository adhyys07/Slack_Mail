import { google } from "googleapis"

export async function listGmailEmails(tokens) {
    const auth = new google.auth.OAuth2()
    auth.setCredentials(tokens)

    const gmail = google.gmail({ version: "v1",auth})
    const res = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5
    })

    return res.data.messages || []
}