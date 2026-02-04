import { google } from "googleapis";
import { saveTokens } from "../providers/googleTokens.js";
import { slackApp } from "../slack/app.js";


function initGoogleOAuth(app) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  app.get("/auth/google", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
      state: req.query.user,
    });

    res.redirect(url);
  });

  app.get("/auth/google/callback", async (req, res) => {
    try {
      const { code, state: slackUserId } = req.query;
      const { tokens } = await oauth2Client.getToken(code);
      saveTokens(slackUserId, tokens);

      // Send Slack DM confirmation
      if (slackUserId && slackApp) {
        try {
          const dm = await slackApp.client.conversations.open({ users: slackUserId });
          if (dm.ok) {
            await slackApp.client.chat.postMessage({
              channel: dm.channel.id,
              text: "✅ Gmail connected successfully!",
            });
          }
        } catch (slackErr) {
          console.error("Failed to send Slack message:", slackErr);
        }
      }

      res.send("✅ Gmail connected successfully. Return to Slack.");
    } catch (err) {
      console.error(err);
      res.status(500).send("❌ OAuth failed");
    }
  });
}

export { initGoogleOAuth };
