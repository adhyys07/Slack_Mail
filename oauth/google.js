import express from "express";
import { google } from "googleapis";
import { saveUser } from "../db/store.js";

export const googleOAuthRouter = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT
);

// LOGIN
googleOAuthRouter.get("/", (req, res) => {
  const slackUserId = req.query.slackUserId;

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
      "profile",
    ],
    state: slackUserId,
  });

  res.redirect(url);
});

// CALLBACK
googleOAuthRouter.get("/callback", async (req, res) => {
  try {
    const slackUserId = req.query.state;
    const { tokens } = await oauth2Client.getToken(req.query.code);

    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });

    await saveUser(`mail:${slackUserId}`, {
      provider: "gmail",
      email: profile.data.emailAddress,
      tokens,
      expiresAt: tokens.expiry_date,
    });

    res.send("✅ Google email connected successfully. You may return to Slack.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Google OAuth failed");
  }
});
