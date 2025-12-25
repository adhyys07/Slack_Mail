import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";

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
  slackApp.command("/inbox", async ({ ack, body, client }) => {
    await ack();

    // Optional UX improvement
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: "📨 Fetching your latest emails…",
    });

    try {
      const cfg = getUserMail(body.user_id);
      if (!cfg) {
        await client.chat.postEphemeral({
          channel: body.channel_id,
          user: body.user_id,
          text: "You’re not connected. Run `/connect-email` first.",
        });
        return;
      }

      let emails = [];

      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        if (
          freshTokens.access_token !== cfg.tokens.access_token &&
          freshTokens.expiry_date
        ) {
          await saveUser(`mail:${body.user_id}`, {
            ...cfg,
            tokens: freshTokens,
            expiresAt: freshTokens.expiry_date,
          });
        }

        emails = await listGmailEmails(freshTokens, 10);
      }

      if (!emails.length) {
        await client.chat.postEphemeral({
          channel: body.channel_id,
          user: body.user_id,
          text: "📭 No emails found.",
        });
        return;
      }

      const text = emails
        .map(
          (e, i) =>
            `*${i + 1}. ${e.subject}*\n_from:_ ${e.from}\n_date:_ ${e.date}`
        )
        .join("\n\n");

      await client.chat.postMessage({
        channel: body.channel_id,
        text,
      });

    } catch (err) {
      console.error("[/inbox]", err);
      await client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: "❌ Failed to load inbox. Try reconnecting with `/connect-email`.",
      });
    }
  });
}
