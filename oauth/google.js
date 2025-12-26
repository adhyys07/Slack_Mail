import { google } from "googleapis";
import fs from "fs";

const DB_PATH = "./db/tokens.json";

function saveTokens(userId, tokens) {
  if (!fs.existsSync("./db")) fs.mkdirSync("./db");

  let db = {};
  if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH));
  }

  db[userId] = tokens;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function initGoogleOAuth(app) {
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
      const { code, state } = req.query;
      const { tokens } = await oauth2Client.getToken(code);
      saveTokens(state, tokens);

      res.send("✅ Gmail connected successfully. You may return to Slack.");
    } catch (err) {
      console.error(err);
      res.status(500).send("❌ OAuth failed");
    }
  });
}
