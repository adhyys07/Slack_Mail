import axios from 'axios'

export async function listOutlookEmails(token){
    const res = await axios.get(
        "https://graphs.microsoft.com/v1.0/me/messages",
        {
            headers:{
                Authorization: `Bearer ${token}`
            }
        }
    )
    return res.data.value
}