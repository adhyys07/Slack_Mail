export function registerCommands(app) {
  /* ---------------- /connect-email ---------------- */
  app.command("/connect-email", async ({ ack, command, respond }) => {
    await ack(); // 🚨 ALWAYS FIRST

    const authUrl = `${process.env.BASE_URL}/auth/google?user=${command.user_id}`;

    await respond({
      text: "Connect your Gmail",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🔐 Click below to securely connect your Gmail account.",
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

      for (const msg of history.messages || []) {
        if (msg.bot_id) {
          await client.chat.delete({
            channel: command.channel_id,
            ts: msg.ts,
          });
        }
      }
    } catch (err) {
      console.error("❌ clear-bot error:", err);
    }
  });
}
