import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";

const log = (...a) => console.log("[commands]", ...a);
const err = (...a) => console.error("[commands]", ...a);

function getUserMail(slackUserId) {
  const cfg = getUser(`mail:${slackUserId}`);
  if (!cfg) return null;

  if (cfg.expiresAt && cfg.expiresAt < Date.now()) {
    deleteUser(`mail:${slackUserId}`);
    return null;
  }

  return cfg;
}

export function registerCommands(slackApp) {

  slackApp.command("/connect-email", async ({ ack, body, client }) => {
    await ack(); // ✅ MUST ACK FAST

    await client.chat.postMessage({
      channel: body.channel_id,
      text: "🔗 Please use the button sent earlier to connect your email.",
    });
  });

  slackApp.command("/inbox", async ({ ack, body, client }) => {
    await ack();

    const channel = body.channel_id;
    const userId = body.user_id;

    await client.chat.postMessage({
      channel,
      text: "📨 Fetching your latest emails…",
    });

    const cfg = getUserMail(userId);
    if (!cfg) {
      await client.chat.postMessage({
        channel,
        text: "❌ You are not connected. Run `/connect-email` first.",
      });
      return;
    }

    try {
      let emails = [];

      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        if (freshTokens.access_token !== cfg.tokens.access_token) {
          await saveUser(`mail:${userId}`, {
            ...cfg,
            tokens: freshTokens,
            expiresAt: freshTokens.expiry_date,
          });
        }

        emails = await listGmailEmails(freshTokens, 10);
      }

      if (!emails || emails.length === 0) {
        await client.chat.postMessage({
          channel,
          text: "📭 No emails found.",
        });
        return;
      }

      const formatted = emails
        .map(
          (e, i) =>
            `*${i + 1}. ${e.subject || "(No subject)"}*\n` +
            `_From:_ ${e.from || "Unknown"}\n` +
            `_Date:_ ${e.date || "Unknown"}`
        )
        .join("\n\n");

      await client.chat.postMessage({
        channel,
        text: formatted,
      });

    } catch (e) {
      err("/inbox failed", e);

      await client.chat.postMessage({
        channel,
        text: "❌ Failed to load inbox. Please reconnect using `/connect-email`.",
      });
    }
  });

  slackApp.command("/clear-bot", async ({ ack, body, client, context }) => {
    await ack();

    try {
      const channel = body.channel_id;
      const botUserId =
        context.botUserId || (await client.auth.test()).user_id;

      const history = await client.conversations.history({
        channel,
        limit: 100,
      });

      const botMessages = (history.messages || []).filter(
        (m) => m.user === botUserId && m.ts
      );

      for (const msg of botMessages) {
        await client.chat.delete({ channel, ts: msg.ts });
      }

      await client.chat.postMessage({
        channel,
        text: "🧹 Bot messages cleared.",
      });
    } catch (e) {
      err("/clear-bot failed", e);
    }
  });
}
