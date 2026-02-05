import { google } from "googleapis";
import { saveUser, getUser } from "../db/store.js";

export async function getGoogleTokens(userId) {
  const user = await getUser(userId);
  
  if (!user || !user.google_tokens) {
    throw new Error("No tokens");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(user.google_tokens);
  return oauth2Client;
}

export async function saveTokens(userId, tokens) {
  const existing = await getUser(userId);
  await saveUser(userId, {
    ...existing,
    google_provider: "google",
    google_tokens: tokens,
    google_access_token: tokens.access_token,
    google_refresh_token: tokens.refresh_token,
  });
}

export async function deleteTokens(userId) {
  const existing = await getUser(userId);
  if (existing) {
    await saveUser(userId, {
      ...existing,
      google_tokens: null,
      google_access_token: null,
      google_refresh_token: null,
    });
  }
}
