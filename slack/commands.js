import { providerDetectModal } from "./views.js";
import { listGmailEmails } from "../providers/gmail.js";
import { listOutlookEmails } from "../providers/outlook.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";

import { getUser, saveUser, deleteUser } from "../db/store.js";

const log = (...a) => console.log("[commands]", ...a);
const err = (...a) => console.error("[commands]", ...a);

function getUserMail(slackUserId) {
  const cfg = getUser(`mail:${slackUserId}`) ?? null;
  if (!cfg) return null;

  return cfg;
}

export function registerCommands(slackApp) {

  slackApp.command("/connect-email", async ({ ack, body, client }) => {
    await ack();
    await client.views.open({
      trigger_id: body.trigger_id,
      view: providerDetectModal(),
    });
  });

  slackApp.command("/clear-bot", async ({ ack, body, client, context }) => {
    await ack();
    const channel = body.channel_id;

    try {
      const botUserId =
        context.botUserId ||
        (await client.auth.test()).user_id;

      const history = await client.conversations.history({
        channel,
        limit: 200,
      });

      const botMessages = (history.messages || [])
        .filter((m) => m.user === botUserId && m.ts)
        .slice(0, 20);

      for (const msg of botMessages) {
        await client.chat.delete({ channel, ts: msg.ts });
      }

    } catch (e) {
      err("/clear-bot", e);
      await client.chat.postMessage({
        channel,
        text: "Failed to clear messages.",
      });
    }
  });

  slackApp.command("/inbox", async ({ ack, body, client }) => {
    await ack();

    const slackUserId = body.user_id;
    const cfg = getUserMail(slackUserId);

    if (!cfg) {
      await client.chat.postMessage({
        channel: body.channel_id,
        text: "You’re not connected. Run `/connect-email` first.",
      });
      return;
    }

    try {
      let emails = [];

      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        if (freshTokens.access_token !== cfg.tokens.access_token) {
          await saveUser(`mail:${slackUserId}`, {
            ...cfg,
            tokens: freshTokens,
            expiresAt: freshTokens.expiry_date,
          });
        }

        emails = await listGmailEmails(freshTokens,10);
      }

      else if (cfg.provider === "microsoft") {
        emails = await listOutlookEmails(cfg.access_token);
      }

      if (!emails || emails.length === 0) {
        await client.chat.postMessage({
          channel: body.channel_id,
          text: "📭 No emails found.",
        });
        return;
      }

      const text = emails
        .slice(0, 10)
        .map(
          (e, i) =>
            `*${i + 1}.* *${e.subject}*\n_from:_ ${e.from}\n_date:_ ${e.date}`
        )
        .join("\n\n");

      await client.chat.postMessage({
        channel: body.channel_id,
        text,
      });

    } catch (e) {
      err("/inbox", e);
      await client.chat.postMessage({
        channel: body.channel_id,
        text: "Failed to load inbox. Reconnect with /connect-email",
      });
    }
  });
}
