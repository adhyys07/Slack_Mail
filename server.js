import express from "express";
import { google } from "googleapis";
import { saveTokens } from "./providers/googleTokens.js";

const app = express();

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
  const { code, state } = req.query;

  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(state, tokens);

  res.send("✅ Gmail connected. You can return to Slack.");
});

app.listen(4000, () => console.log("OAuth server running"));
