import { providerDetectModal } from "./views.js";
import { listGmailEmails } from "../providers/gmail.js";
import { listOutlookEmails } from "../providers/outlook.js";
import { getUser, deleteUser } from "../db/store.js";
import { use } from "react";

const log = (...a) => console.log("[commands]", ...a);
const err = (...a) => console.error("[commands]", ...a);

function getUserMail(slackUserId) {
    const cfg = getUser(`mail:${slackUserId}`) ?? null;
    if (!cfg) return null;

    if (cfg.expiresAt && cfg.expiresAt < Date.now()) {
        deleteUser(`mail:${slackUserId}`);
        return null;
    }
    return cfg;
}

export function registerCommands(slackApp) {

    // /connect-email
    slackApp.command("/connect-email", async ({ ack, body, client }) => {
        await ack();
        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal(),
        });
    });

    slackApp.command("/clear-bot", async({ack,body,client,context}) => {
        await ack();
        const channel = body.channel_id;

        try{
            const botUserId =
                context.botUserId ||
                (await client.auth.test()).user_id;
            
            const history = await client.conversations.history({
                channel,
                limit:200,
            });

            const botMessages = (history.messages || [])
                .filter((m)=> m.user === botUserId && m.ts)
                .slice(0,20);
            
            for (const msg of botMessages) {
                await client.chat.delete({channel, ts:msg.ts});
            }

            await client.chat.postMessage({
                channel,
                text: `Cleared ${botMessages.length} recent bot messages in this conversation.`,
            });
        }   catch (err){
            console.error("[/clear-bot] error",err);
            await client.chat.postMessage({
                channel,
                user:body.user_id,
                text: "Failed to clear messages. Ensure the app has history + chat:write scopes.",
            })
        }
    });


    // /inbox
    slackApp.command("/inbox", async ({ ack, body, client }) => {
        await ack();

        const cfg = getUserMail(body.user_id);
        if (!cfg) {
            await client.chat.postMessage({
                channel: body.channel_id,
                user: body.user_id,
                text: "You’re not connected. Run `/connect-email` first.",
            });
            return;
        }

        try {
            let emails = [];

            if (cfg.provider === "gmail") {
                emails = await listGmailEmails(cfg.tokens);
            } else if (cfg.provider === "microsoft") {
                emails = await listOutlookEmails(cfg.access_token);
            }

            if (!emails.length) {
                await client.chat.postMessage({
                    channel: body.channel_id,
                    user: body.user_id,
                    text: "📭 No emails found.",
                });
                return;
            }

            const text = emails.map(
                (e, i) =>
                    `*${i + 1}.* *${e.subject}*\n_from:_ ${e.from}\n_date:_ ${e.date}`
            ).join("\n\n");

            await client.chat.postMessage({
                channel: body.channel_id,
                user: body.user_id,
                text,
            });

        } catch (e) {
            err("/inbox", e);
            await client.chat.postMessage({
                channel: body.channel_id,
                user: body.user_id,
                text: "Failed to load inbox. Reconnect with /connect-email",
            });
        }
    });
}
