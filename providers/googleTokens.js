import { google } from "googleapis";

export async function getValidGoogleTokens(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT
  );

  client.setCredentials(tokens);

  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await client.refreshAccessToken();
    return credentials;
  }

  return tokens;
}
