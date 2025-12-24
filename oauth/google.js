import express from "express";
import { google } from "googleapis";
import { slackApp } from "../slack/app.js";
import { saveUserMail } from "../slack/commands.js";

export const googleOAuthRouter = express.Router();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT
)

googleOAuthRouter.get("/", (req, res) => {
  const slackUserId = req.query.slackUserId;
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://mail.google.com/", // IMAP XOAUTH2
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
    try {
        const { tokens } = await oauth2Client.getToken(req.query.code);
        oauth2Client.setCredentials(tokens)
        console.log(tokens);
        
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const me = await gmail.users.getProfile({ userId: "me" });
        const userEmail = me.data.emailAddress;

    // Build XOAUTH2 string for IMAP
        const xoauth2 = Buffer.from(
          `user=${userEmail}\u0001auth=Bearer ${tokens.access_token}\u0001\u0001`
        ).toString("base64");

        if (slackUserId) {
          saveUserMail(slackUserId, userEmail, "gmail", xoauth2);

          const dm = await slackApp.client.conversations.open({ users: slackUserId });
          if (dm.ok) {
            await slackApp.client.chat.postMessage({
              channel: dm.channel.id,
              text: "Google email connected successfully",
            });
          }
        }

    res.send("Google E-mail connected successfully !!");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Google OAuth Failed !!");
  }
});