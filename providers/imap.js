import imaps from "imap-simple"

export async function listImapEmails(config) {
    const connection = await imaps.connect({
       imap:{
        user:config.email,
        password:config.password,
        host: config.host,
        port: 993,
        tls: true
       } 
    })
    await connection.openBox("INBOX")
    const results = await connection.search(["UNSEEN"],{
        bodies:["HEADER.FIELD (FROM SUBJECT DATE)"],
        markSeen: false
    })
    return results
}
