import express from "express";
import { google } from "googleapis";
import { slackApp } from "../slack/app.js";
import { saveUser } from "../db/store.js";

export const googleOAuthRouter = express.Router();

googleOAuthRouter.get("/", (req, res) => {
  const slackUserId = req.query.slackUserId;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
      "profile",
    ],
    state: slackUserId || "",
  });

  res.redirect(url);
});

googleOAuthRouter.get("/callback", async (req, res) => {
  const slackUserId = req.query.state;

  if (!req.query.code) {
    return res.status(400).send("Missing OAuth code");
  }

  try {
    // ✅ create a fresh client per request
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT
    );

    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const me = await gmail.users.getProfile({ userId: "me" });

    const userEmail = me.data.emailAddress;

    // ✅ Save full token set
    if (slackUserId) {
      saveUser(`mail:${slackUserId}`, {
        provider: "gmail",
        email: userEmail,
        tokens,
        expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
      });

      const dm = await slackApp.client.conversations.open({
        users: slackUserId,
      });

      if (dm.ok) {
        await slackApp.client.chat.postMessage({
          channel: dm.channel.id,
          text: "✅ Google email connected successfully",
        });
      }
    }

    res.send("Google E-mail connected successfully ✅");
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).send("Google OAuth Failed");
  }
});
