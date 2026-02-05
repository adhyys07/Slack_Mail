import axios from "axios";
import { saveUser } from "../db/store.js";
import { slackApp } from "../slack/app.js";

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REDIRECT_URI = process.env.MS_REDIRECT;

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function initMicrosoftOAuth(app) {
  app.get("/auth/microsoft", (req, res) => {
    const slackUserId = req.query.user;

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      response_mode: "query",
      scope: "offline_access Mail.Read Mail.Send IMAP.AccessAsUser.All",
      state: slackUserId || "",
    });
    res.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  app.get("/auth/microsoft/callback", async (req, res) => {
    const { code, state: slackUserId } = req.query;

    try {
      const tokenRes = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;

      if (slackUserId) {
        const xoauth2 = Buffer.from(
          `user=${"unknown"}\u0001auth=Bearer ${access_token}\u0001\u0001`
        ).toString("base64");
        saveUser(slackUserId, {
          provider: "microsoft",
          access_token,
          refresh_token,
          expires_at: Date.now() + expires_in * 1000,
          xoauth2,
        });

        try {
          const dm = await slackApp.client.conversations.open({ users: slackUserId });
          if (dm.ok) {
            await slackApp.client.chat.postMessage({
              channel: dm.channel.id,
              text: "✅ Outlook connected successfully!",
            });
          }
        } catch (slackErr) {
          console.error("Failed to send Slack message:", slackErr);
        }
      }

      res.send("✅ Microsoft Email connected successfully");
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(500).send("❌ Microsoft OAuth Failed!");
    }
  });
}

export { initMicrosoftOAuth };