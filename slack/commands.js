import { providerDetectModal } from "./views.js";
import { listGmailEmails } from "../providers/gmail.js";
import { listOutlookEmails } from "../providers/outlook.js";
import { saveUser, getUser, deleteUser } from "../db/store.js";

const log = (...args) => console.log("[commands]", ...args);
const logErr = (...args) => console.error("[commands]", ...args);

// ✅ Unified mail config fetch
async function getUserMailConfig(slackUserId) {
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

    // =======================
    // /connect-email
    // =======================
    slackApp.command("/connect-email", async ({ ack, body, client }) => {
        await ack();
        log("/connect-email", { user: body.user_id });

        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal(),
        });
    });

    // =======================
    // /inbox
    // =======================
    slackApp.command("/inbox", async ({ ack, body, client }) => {
        await ack();

        const slackUserId = body.user_id;
        log("/inbox", { user: slackUserId });

        const cfg = await getUserMailConfig(slackUserId);

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
            } else if (cfg.provider === "microsoft") {
                messages = await listOutlookEmails(cfg.access_token);
            }

            if (!messages.length) {
                await client.chat.postEphemeral({
                    channel: body.channel_id,
                    user: slackUserId,
                    text: "📭 No emails found.",
                });
                return;
            }

            const formatted = messages.map((m, i) =>
                `*${i + 1}.* *${m.subject}*\n_from:_ ${m.from}\n_date:_ ${m.date}`
            );

            await client.chat.postEphemeral({
                channel: body.channel_id,
                user: slackUserId,
                text: formatted.join("\n\n"),
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
