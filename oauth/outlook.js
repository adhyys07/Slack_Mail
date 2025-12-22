import axios from "axios"

export async function listOutlookEmails(accessToken) {
    const res = await axios.get(
        "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=5",
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    )
    return res.data.value.map(mail => ({
        id:mail.id,
        subject:mail.subject,
        from:mail.from.emailAddress.address,
        date: mail.recievedDataTime
    }))
}