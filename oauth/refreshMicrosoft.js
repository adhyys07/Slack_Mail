import axios from "axios"

export async function refreshMicrosoftToken(refreshToken){
    const res = await axios.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.MS_CLIENT_SECRET,
            refreshToken:"refresh_token",
            scope:"offline_access Mail.Read Mail.Send"
        }),
        {
            headers: {
                "Content-Type":"application/x-www-form-urlencoded"
            }
        }
    )
    return res.data
}