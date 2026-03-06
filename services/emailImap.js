import Imap from "imap";
import { simpleParser } from "mailparser";
import { getUser } from "../db/store.js";
import { ensureMicrosoftAccessToken } from "./emailSender.js";

function xoauth2String(email, accessToken) {
    return Buffer.from(`user=${email}\u0001auth=Bearer ${accessToken}\u0001\u0001`).toString("base64");
}

async function fetchImapMessages(host, accessToken, emailHint, limit = 5) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: emailHint || "me",
            xoauth2: xoauth2String(emailHint || "me", accessToken),
            host,
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
        });

        imap.once("error", reject);
        imap.once("ready", () => {
            imap.openBox("INBOX", true, (err) => {
                if (err) return reject(err);
                imap.search(["UNSEEN"], (err2, results) => {
                    if (err2) return reject(err2);
                    const ids = (results || []).slice(-limit);
                    if (!ids.length) {
                        imap.end();
                        return resolve([]);
                    }
                    const f = imap.fetch(ids, { bodies: "" });
                    const mails = [];
                    f.on("message", (msg) => {
                        let buf = "";
                        msg.on("body", (stream) => {
                            stream.on("data", (chunk) => (buf += chunk.toString("utf8")));
                        });
                        msg.once("end", async () => {
                            const parsed = await simpleParser(buf);
                            mails.push({
                                subject: parsed.subject || "No subject",
                                from: parsed.from?.text || "Unknown",
                            });
                        });
                    });
                    f.once("end", () => {
                        imap.end();
                        resolve(mails);
                    });
                });
            });
        });

        imap.connect();
    });
}

export async function fetchImapGmail(userId, limit = 5) {
    const user = await getUser(userId);
    if (!user?.google_tokens?.access_token) throw new Error("Gmail not connected");
    return fetchImapMessages("imap.gmail.com", user.google_tokens.access_token, "me", limit);
}

export async function fetchImapOutlook(userId, limit = 5) {
    const token = await ensureMicrosoftAccessToken(userId);
    return fetchImapMessages("outlook.office365.com", token, "me", limit);
}
