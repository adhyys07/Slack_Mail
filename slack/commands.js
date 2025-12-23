import { providerDetectModal } from "./views.js";
import { listImapEmails } from "../providers/imap.js";

// In-memory store; replace with a real DB in production
const userMailStore = new Map();

export function saveUserMail(slackUserId, { email, provider, xoauth2 }) {
    const host = provider === "gmail" ? "imap.gmail.com" : "outlook.office365.com";
    userMailStore.set(slackUserId, { email, host, xoauth2, provider });
}

async function getUserImapConfig(slackUserId) {
    if (userMailStore.has(slackUserId)) return userMailStore.get(slackUserId);
    return null;
}

export function registerCommands(slackApp) {
    slackApp.command("/connect-email", async ({ack,body,client}) => {
        console.log("CONNECT EMAIL HANDLER HIT")
        await ack()
        console.log("ACK SENT")
        
        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal()
        });
    });

    slackApp.command("/inbox",async ({ack,body,client})=>{
        await ack();
        const slackUserId = body.user_id;

        const cfg = await getUserImapConfig(slackUserId);
        if (!cfg){
            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text:"You’re not connected. Run `/connect-email` to link your account."
            });
            return;
        }
        try{
            const messages = await listImapEmails(cfg);
            const latest = messages.slice(-6).map((m) => {
                const h = m.parts[0].body;
                return `• From: ${h.from} | Subject: ${h.subject} | Date: ${h.date}`;
            });

            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text:latest.length ? latest.join("\n") : "No unseen messages.",
            });
        } catch(err){
            console.error("[/inbox] error",err)
            await client.chat.postEphemeral({
                channel:body.channel_id,
                user:slackUserId,
                text:"Failed to load inbox. Please reconnect with /connect-email"
            });
        };
    });
}   