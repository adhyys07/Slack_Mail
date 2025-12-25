import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";
import { providerDetectModal } from "./views.js";

/* ------------------ helpers ------------------ */

function getUserMail(slackUserId) {
  const cfg = getUser(`mail:${slackUserId}`);
  if (!cfg) return null;

  // Token hard-expired → clear
  if (cfg.expiresAt && cfg.expiresAt < Date.now()) {
    deleteUser(`mail:${slackUserId}`);
    return null;
  }

  return cfg;
}

/* ------------------ commands ------------------ */

export function registerCommands(slackApp) {

  /* ---------- /connect-email ---------- */
  slackApp.command("/connect-email", async ({ ack, body, client }) => {
    await ack(); // MUST be immediate

    await client.views.open({
      trigger_id: body.trigger_id,
      view: providerDetectModal(),
    });
  });

  /* ---------- /inbox ---------- */
  slackApp.command("/inbox", async ({ ack, body, client }) => {
    // ✅ ACK FIRST (prevents 3s timeout)
    await ack();

    // UX: instant feedback
    await client.chat.postMessage({
      channel: body.channel_id,
      user: body.user_id,
      text: "📨 Fetching your latest emails…",
    });

    try {
      const cfg = getUserMail(body.user_id);
      if (!cfg) {
        await client.chat.postMessage({
          channel: body.channel_id,
          user: body.user_id,
          text: "You’re not connected. Run `/connect-email` first.",
        });
        return;
      }

      let emails = [];

      /* ---------- Gmail ---------- */
      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        // Persist refreshed token
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
        await client.chat.postMessage({
          channel: body.channel_id,
          user: body.user_id,
          text: "📭 No emails found.",
        });
        return;
      }

      // Format output
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
      await client.chat.postMessage({
        channel: body.channel_id,
        user: body.user_id,
        text: "❌ Failed to load inbox. Try reconnecting with `/connect-email`.",
      });
    }
  });

  /* ---------- /clear-bot (optional utility) ---------- */
  slackApp.command("/clear-bot", async ({ ack, body, client, context }) => {
    await ack();

    try {
      const botUserId =
        context.botUserId ||
        (await client.auth.test()).user_id;

      const history = await client.conversations.history({
        channel: body.channel_id,
        limit: 200,
      });

      const botMessages = (history.messages || [])
        .filter((m) => m.user === botUserId && m.ts)
        .slice(0, 20);

      for (const msg of botMessages) {
        await client.chat.delete({
          channel: body.channel_id,
          ts: msg.ts,
        });
      }

    } catch (err) {
      console.error("[/clear-bot]", err);
      await client.chat.postMessage({
        channel: body.channel_id,
        user: body.user_id,
        text: "Failed to clear messages. Check scopes.",
      });
    }
  });
}
