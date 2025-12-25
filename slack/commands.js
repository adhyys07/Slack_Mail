import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";

const log = (...a) => console.log("[commands]", ...a);
const error = (...a) => console.error("[commands]", ...a);

// Load stored user config
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

  /* ======================
     /inbox
     ====================== */
  slackApp.command("/inbox", async ({ ack, body, client }) => {
    await ack(); // ✅ MUST ACK FIRST

    const channel = body.channel_id;
    const userId = body.user_id;

    // Immediate feedback
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

      // ---------- GMAIL ----------
      if (cfg.provider === "gmail") {
        const freshTokens = await getValidGoogleTokens(cfg.tokens);

        // Save refreshed token if changed
        if (freshTokens.access_token !== cfg.tokens.access_token) {
          await saveUser(`mail:${userId}`, {
            ...cfg,
            tokens: freshTokens,
            expiresAt: freshTokens.expiry_date,
          });
        }

        emails = await listGmailEmails(freshTokens, 10);
      }

      // ---------- RESULT ----------
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
            `*${i + 1}. ${e.subject || "(No Subject)"}*\n` +
            `_From:_ ${e.from || "Unknown"}\n` +
            `_Date:_ ${e.date || "Unknown"}`
        )
        .join("\n\n");

      await client.chat.postMessage({
        channel,
        text: formatted,
      });

    } catch (err) {
      error("Inbox error:", err);

      await client.chat.postMessage({
        channel,
        text: "❌ Failed to load inbox. Please reconnect using `/connect-email`.",
      });
    }
  });
}
