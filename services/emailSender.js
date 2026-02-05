import axios from "axios";
import { google } from "googleapis";
import { getUser } from "../db/store.js";

export async function sendEmailViaGoogle(userId, recipientEmail, subject, body) {
  console.log(`📧 Starting Google email send to ${recipientEmail}`);
  
  const user = await getUser(userId);
  if (!user || !user.google_tokens) {
    throw new Error("Google tokens not found. Please connect Gmail first.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(user.google_tokens);
  
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message = [
    "From: me",
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    console.log(`✅ Gmail email sent successfully. Message ID: ${response.data.id}`);
    return {
      success: true,
      messageId: response.data.id,
      provider: "Gmail",
    };
  } catch (err) {
    console.error(`❌ Gmail API error: ${err.message}`);
    throw new Error(`Gmail error: ${err.message}`);
  }
}

export async function sendEmailViaOutlook(userId, recipientEmail, subject, body) {
  console.log(`📧 Starting Outlook email send to ${recipientEmail}`);
  
  const user = await getUser(userId);
  if (!user || !user.microsoft_access_token) {
    throw new Error("Microsoft token not found. Please connect Outlook first.");
  }

  const msToken = user.microsoft_access_token;

  try {
    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        message: {
          subject: subject,
          body: {
            contentType: "text/plain",
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      },
      {
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Outlook email sent successfully. Status: ${response.status}`);
    return {
      success: true,
      status: response.status,
      provider: "Outlook",
    };
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error(`❌ Outlook API error: ${errorMsg}`);
    
    // Check if token is expired
    if (err.response?.status === 401) {
      throw new Error("Outlook token expired. Please reconnect with `/connect-email`");
    }
    
    throw new Error(`Outlook error: ${errorMsg}`);
  }
}

export async function sendEmail(userId, provider, recipientEmail, subject, body) {
  console.log(`\n🚀 sendEmail called: provider=${provider}, recipient=${recipientEmail}`);
  
  if (provider === "google") {
    return await sendEmailViaGoogle(userId, recipientEmail, subject, body);
  } else if (provider === "microsoft") {
    return await sendEmailViaOutlook(userId, recipientEmail, subject, body);
  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }
}
