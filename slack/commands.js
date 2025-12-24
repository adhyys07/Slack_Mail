import { providerDetectModal } from "./views.js";
import { listGmailEmails } from "../mail/gmail.js";
import { listOutlookEmails } from "../providers/outlook.js";
import { saveUser, getUser, deleteUser } from "../db/store.js";

const log = (...args) => console.log("[commands]", ...args);
const logErr = (...args) => console.error("[commands]", ...args);

export function saveUserMail(slackUserId, email, provider, xoauth2) {
    const host = provider === "gmail" ? "imap.gmail.com" : "outlook.office365.com";
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    saveUser(`mail:${slackUserId}`, { email, host, xoauth2, provider, expiresAt });
    log("saved mail config", { slackUserId, provider, host, expiresAt });
}

async function getUserImapConfig(slackUserId) {
    const cfg = getUser(`mail:${slackUserId}`) ?? null;
    if (!cfg) return null;
    if (cfg.expiresAt && cfg.expiresAt < Date.now()) {
        deleteUser(`mail:${slackUserId}`);
        log("mail config expired", { slackUserId });
        return null;
    }
    return cfg;
}

export function registerCommands(slackApp) {
    slackApp.command("/connect-email", async ({ ack, body, client }) => {
        log("/connect-email", { user: body.user_id });
        await ack();

        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal(),
        });
    });

    slackApp.command("/inbox", async ({ ack, body, client }) => {
        await ack();
        const slackUserId = body.user_id;
        log("/inbox", { user: slackUserId });

        const cfg = await getUserImapConfig(slackUserId);
        if (!cfg) {
            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text: "You’re not connected or your token expired. Run `/connect-email` to link your account.",
            });
            return;
        }

        try {
            let messages = [];
            
            if (cfg.provider === "gmail") {
                messages = await listGmailEmails(cfg.tokens);
            } else if (cfg.provider === "microsoft"){
                messages = await listOutlookEmails(cfg.access_token);
            }
            const latest = messages.slice(-6).map((m) => {
                const h = m.parts[0].body;
                return `• From: ${h.from} | Subject: ${h.subject} | Date: ${h.date}`;
            });

            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text: latest.length ? latest.join("\n") : "No unseen messages.",
            });
        } catch (err) {
            logErr("[/inbox] error", err);
            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text: "Failed to load inbox. Please reconnect with /connect-email",
            });
        }
    });
}