import { getUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { fetchGmail } from "../providers/gmail.js";

function registerCommands(app) {
  app.command("/connect-email", async ({ ack, command, respond }) => {
    await ack();

    const googleAuthUrl = `${process.env.BASE_URL}/auth/google?user=${command.user_id}`;
    const microsoftAuthUrl = `${process.env.BASE_URL}/auth/microsoft?user=${command.user_id}`;

    await respond({
      text: "Connect your Gmail",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🔐 Click below to connect your Gmail account.",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Connect Gmail" },
              url: googleAuthUrl,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Connect Microsoft" },
              url: microsoftAuthUrl,
            }
          ],
        },
      ],
    });
  });

  app.command("/check-accounts", async ({ ack, command, respond }) => {
    await ack();

    try {
      const userId = command.user_id;
      const userMail = await getUser(userId);

      // Check for Google tokens (stored in file system)
      let googleStatus = "❌ Not connected";
      try {
        const googleTokens = await getGoogleTokens(userId);
        console.log("Google tokens for user:", googleTokens);
        if (googleTokens) googleStatus = "✅ Connected";
      } catch (err) {
        googleStatus = "❌ Not connected";
        console.error("Error checking Google tokens:", err.message);
      }

      // Check for Microsoft tokens (stored in Redis)
      let microsoftStatus = "❌ Not connected";
      console.log("User mail data:", userMail);
      if (userMail && userMail.provider === "microsoft" && userMail.access_token) {
        microsoftStatus = "✅ Connected";
      }

      await respond({
        text: "Email Account Status",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📧 *Email Account Status*\n\n*Gmail:* ${googleStatus}\n*Microsoft/Outlook:* ${microsoftStatus}`,
            },
          },
        ],
      });
    } catch (err) {
      console.error("check-accounts error:", err);
      await respond("❌ Error checking accounts. Please try again later.");
    }
  });

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
      console.error("clear-bot error:", err);
    }
  });

  app.command("/get-emails", async ({ ack, command, respond }) => {
    await ack();

    try {
      const emails = await fetchGmail(command.user_id);

      if (!emails || emails.length === 0) {
        await respond({
          text: "📭 No unread emails found.",
        });
        return;
      }

      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📬 *You have ${emails.length} unread email(s)*`,
          },
        },
        { type: "divider" },
      ];

      for (const email of emails) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${email.subject}*\nFrom: ${email.from}`,
          },
        });
      }

      await respond({ blocks });
    } catch (err) {
      console.error("get-emails error:", err);
      await respond({
        text: "❌ Failed to fetch emails. Make sure you've connected your Gmail account with `/connect-email`",
      });
    }
  });
}

export { registerCommands };
