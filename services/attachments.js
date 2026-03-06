import { google } from "googleapis";
import axios from "axios";
import { getUser } from "../db/store.js";
import { ensureMicrosoftAccessToken } from "./emailSender.js";

export async function listGmailAttachments(userId, messageId) {
    const user = await getUser(userId);
    if (!user?.google_tokens?.access_token) throw new Error("Google not connected. Please /connect-email again.");

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: user.google_tokens.access_token });
    const gmail = google.gmail({ version: "v1", auth });

    const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });

    const attachments = [];
    const walk = (p) => {
        if (!p) return;
        if (p.filename && p.body?.attachmentId) {
            attachments.push({
                id: p.body.attachmentId,
                filename: p.filename,
                mimeType: p.mimeType || "application/octet-stream",
                size: p.body.size || 0,
            });
        }
        (p.parts || []).forEach(walk);
    };

    (msg.data.payload?.parts || []).forEach(walk);
    return attachments;
}

export async function downloadGmailAttachment(userId, messageId, attachmentId) {
    const user = await getUser(userId);
    if (!user?.google_tokens?.access_token) throw new Error("Google not connected. Please /connect-email again.");

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: user.google_tokens.access_token });
    const gmail = google.gmail({ version: "v1", auth });

    const resp = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
    const data = resp.data?.data;
    const buf = Buffer.from(data, "base64");
    return { buffer: buf };
}

export async function listOutlookAttachments(userId, messageId) {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    const resp = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline&$top=15`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return (resp.data.value || []).map((a) => ({
        id: a.id,
        filename: a.name,
        mimeType: a.contentType || "application/octet-stream",
        size: a.size || 0,
    }));
}

export async function downloadOutlookAttachment(userId, messageId, attachmentId) {
    const accessToken = await ensureMicrosoftAccessToken(userId);
    const resp = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}/$value`,
        { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "arraybuffer" }
    );
    const buf = Buffer.from(resp.data);
    return { buffer: buf };
}