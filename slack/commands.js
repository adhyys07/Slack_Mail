import { app } from "./app.js";
import { fetchGmail, disconnectGmail } from "../providers/gmail.js";

/* ---------------- /mail ---------------- */
app.command("/mail", async ({ ack, command, respond }) => {
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
