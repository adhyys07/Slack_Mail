import { google } from "googleapis";
import { saveUser, getUser } from "../db/store.js";

export async function getGoogleTokens(userId) {
  const user = await getUser(userId);
  
  if (!user || !user.tokens) {
    throw new Error("No tokens");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(user.tokens);
  return oauth2Client;
}

export async function saveTokens(userId, tokens) {
  const existing = await getUser(userId);
  await saveUser(userId, {
    ...existing,
    provider: "google",
    tokens: tokens,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
}

export async function deleteTokens(userId) {
  const existing = await getUser(userId);
  if (existing) {
    await saveUser(userId, {
      ...existing,
      tokens: null,
      access_token: null,
      refresh_token: null,
    });
  }
}
