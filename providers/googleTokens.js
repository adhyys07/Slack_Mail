import fs from "fs";
import path from "path";
import { google } from "googleapis";

const TOKEN_DIR = "./tokens";

export async function getGoogleTokens(userId) {
  const tokenPath = path.join(TOKEN_DIR, `${userId}.json`);

  if (!fs.existsSync(tokenPath)) {
    throw new Error("No tokens");
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

export async function saveTokens(userId, tokens) {
  if (!fs.existsSync(TOKEN_DIR)) fs.mkdirSync(TOKEN_DIR);
  fs.writeFileSync(`${TOKEN_DIR}/${userId}.json`, JSON.stringify(tokens));
}

export async function deleteTokens(userId) {
  const file = `${TOKEN_DIR}/${userId}.json`;
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
