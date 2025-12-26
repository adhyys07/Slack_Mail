import { listGmailEmails } from "../providers/gmail.js";
import { getValidGoogleTokens } from "../providers/googleTokens.js";
import { getUser, saveUser, deleteUser } from "../db/store.js";
import { providerDetectModal } from "./views.js";

const log = (...a) => console.log("[commands]", ...a);
const error = (...a) => console.error("[commands]", ...a);

// Load stored user config
async function getUserMail(slackUserId) {
  const cfg = await getUser(`mail:${slackUserId}`);
  if (!cfg) return null;

  if (cfg.expiresAt && cfg.expiresAt < Date.now()) {
    await deleteUser(`mail:${slackUserId}`);
    return null;
  }

  return cfg;
}

export function registerCommands(slackApp) {

  /* ======================
     /connect-email
     ====================== */
  slackApp.command("/connect-email", async ({ ack, body, client }) => {
    await ack();
    log("/connect-email", { user: body.user_id });
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: providerDetectModal(),
    });
  });

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

    const cfg = await getUserMail(userId);
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

  /* ======================
     /clear-bot
     ====================== */
  slackApp.command("/clear-bot", async ({ ack, body, client, context }) => {
    await ack();
    const channel = body.channel_id;
    log("/clear-bot", { user: body.user_id, channel });

    try {
      const botUserId = context.botUserId || (await client.auth.test()).user_id;

      const history = await client.conversations.history({
        channel,
        limit: 100,
      });

      const botMessages = (history.messages || [])
        .filter((m) => m.user === botUserId && m.ts)
        .slice(0, 20);

      for (const msg of botMessages) {
        await client.chat.delete({ channel, ts: msg.ts });
      }

      await client.chat.postMessage({
        channel,
        text: `🧹 Cleared ${botMessages.length} bot messages.`,
      });
    } catch (err) {
      error("/clear-bot error", err);
      await client.chat.postMessage({
        channel,
        text: "❌ Failed to clear messages. Ensure the app has history + chat:write scopes.",
      });
    }
  });
}

  await ack(); // 🚨 MUST BE FIRST

  try {
    const emails = await fetchGmail(command.user_id);

    if (!emails.length) {
      await respond("📭 No unread emails found.");
      return;
    }

    let msg = "*📨 Latest Emails:*\n\n";
    emails.forEach((m, i) => {
      msg += `*${i + 1}. ${m.subject}*\nFrom: ${m.from}\n\n`;
    });

    await respond(msg);
  } catch (err) {
    console.error(err);
    await respond("❌ Email not connected. Use `/connect-email`");
  }
});

/* ---------------- /connect-email ---------------- */
app.command("/connect-email", async ({ ack, command, respond }) => {
  await ack();

  const authUrl = `https://your-domain.com/auth/google?user=${command.user_id}`;

  await respond({
    text: "🔐 Connect your Gmail account",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Click below to connect your Gmail securely 👇",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Connect Gmail",
            },
            url: authUrl,
          },
        ],
      },
    ],
  });
});

/* ---------------- /clear-bot ---------------- */
app.command("/clear-bot", async ({ ack, command, client }) => {
  await ack();

  try {
    const history = await client.conversations.history({
      channel: command.channel_id,
      limit: 50,
    });

    for (const msg of history.messages) {
      if (msg.bot_id) {
        await client.chat.delete({
          channel: command.channel_id,
          ts: msg.ts,
        });
      }
    }
  } catch (err) {
    console.error("Clear bot error:", err);
  }
});
