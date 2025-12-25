import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";

export function registerCommands(slackApp) {

  slackApp.command("/inbox", async ({ ack, body, client }) => {
    await ack(); // ✅ MUST be first

    const channel = body.channel_id;
    const userId = body.user_id;

    await client.chat.postMessage({
      channel,
      text: "📨 Fetching your latest emails…",
    });

    const cfg = getUser(`mail:${userId}`);
    if (!cfg) {
      await client.chat.postMessage({
        channel,
        text: "❌ Run `/connect-email` first.",
      });
      return;
    }

    try {
      let tokens = cfg.tokens;

      // 🔁 Refresh Google tokens if expired
      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        if (freshTokens.access_token !== cfg.tokens.access_token) {
          saveUser(`mail:${userId}`, {
            ...cfg,
            tokens: freshTokens,
            expiresAt: freshTokens.expiry_date,
          });
        }

        tokens = freshTokens;
      }

      const emails = await listGmailEmails(tokens, 10);

      if (!emails.length) {
        await client.chat.postMessage({
          channel,
          text: "📭 No emails found.",
        });
        return;
      }

      const text = emails.map(
        (e, i) =>
          `*${i + 1}. ${e.subject || "(No Subject)"}*\n` +
          `_From:_ ${e.from}\n` +
          `_Date:_ ${e.date}`
      ).join("\n\n");

      await client.chat.postMessage({ channel, text });

    } catch (err) {
      console.error("[/inbox error]", err);
      await client.chat.postMessage({
        channel,
        text: "❌ Failed to load inbox. Reconnect using `/connect-email`.",
      });
    }
  });
}
