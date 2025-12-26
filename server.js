import express from "express";
import dotenv from "dotenv";
import { App } from "@slack/bolt";
import { google } from "googleapis";
import { saveTokens } from "./providers/googleTokens.js";

dotenv.config();

const expressApp = express();

/* ---------------- SLACK BOLT ---------------- */
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver: undefined, // IMPORTANT
});

await slackApp.init();

/* Mount Slack on Express */
expressApp.use("/slack/events", slackApp.receiver.app);

/* ---------------- GOOGLE OAUTH ---------------- */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

expressApp.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    state: req.query.user,
  });
  res.redirect(url);
});

expressApp.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(state, tokens);
  res.send("✅ Gmail connected. Return to Slack.");
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;

expressApp.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
