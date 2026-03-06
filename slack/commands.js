import axios from "axios";
import { google } from "googleapis";
import { getUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { fetchGmail } from "../providers/gmail.js";
import { sendEmail } from "../services/emailSender.js";
import {
  listGmailAttachments,
  listOutlookAttachments,
} from "../services/attachments.js";

function registerCommands(app) {
  app.command("/connect-email", async ({ ack, command, respond }) => {
    await ack();

    const googleAuthUrl = `${process.env.BASE_URL}/auth/google?user=${command.user_id}`;
    const microsoftAuthUrl = `${process.env.BASE_URL}/auth/microsoft?user=${command.user_id}`;

    await respond({
      text: "Connect your Gmail",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🔐 Click below to connect your Gmail account.",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Connect Gmail" },
              url: googleAuthUrl,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Connect Microsoft" },
              url: microsoftAuthUrl,
            }
          ],
        },
      ],
    });
  });

  app.command("/check-accounts", async ({ ack, command, respond }) => {
    await ack();

    try {
      const userId = command.user_id;
      const userMail = await getUser(userId);

      // Check for Google tokens (stored in file system)
      let googleStatus = "❌ Not connected";
      try {
        const googleTokens = await getGoogleTokens(userId);
        console.log("Google tokens for user:", googleTokens);
        if (googleTokens) googleStatus = "✅ Connected";
      } catch (err) {
        googleStatus = "❌ Not connected";
        console.error("Error checking Google tokens:", err.message);
      }

      // Check for Microsoft tokens (stored in Redis)
      let microsoftStatus = "❌ Not connected";
      console.log("User mail data:", userMail);
      if (userMail && userMail.microsoft_provider === "microsoft" && userMail.microsoft_access_token) {
        microsoftStatus = "✅ Connected";
      }

      await respond({
        text: "Email Account Status",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📧 *Email Account Status*\n\n*Gmail:* ${googleStatus}\n*Microsoft/Outlook:* ${microsoftStatus}`,
            },
          },
        ],
      });
    } catch (err) {
      console.error("check-accounts error:", err);
      await respond("❌ Error checking accounts. Please try again later.");
    }
  });

  app.command("/clear-bot", async ({ ack, command, client }) => {
    await ack();

    try {
      const history = await client.conversations.history({
        channel: command.channel_id,
        limit: 50,
      });

      for (const msg of history.messages || []) {
        if (msg.bot_id) {
          await client.chat.delete({
            channel: command.channel_id,
            ts: msg.ts,
          });
        }
      }
    } catch (err) {
      console.error("clear-bot error:", err);
    }
  });

  app.command("/get-emails", async ({ command, ack, respond }) => {
    await ack();

    try {
      const userId = command.user_id;
      const provider = command.text.trim().toLowerCase();

      if (!provider || !["google", "gmail", "microsoft", "outlook"].includes(provider)) {
        await respond("❌ Please specify a provider: `/get-emails google` or `/get-emails microsoft`");
        return;
      }

      const normalizedProvider = (provider === "google" || provider === "gmail") ? "google" : "microsoft";

      if (normalizedProvider === "google") {
        try {
          const oauth2Client = await getGoogleTokens(userId);
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          const response = await gmail.users.messages.list({
            userId: "me",
            q: "category:primary",
            maxResults: 5,
          });

          const messages = response.data.messages || [];

          if (messages.length === 0) {
            await respond("✅ No emails found in Gmail primary inbox.");
            return;
          }

          let emailText = `📧 *Gmail (last ${messages.length})*\n\n`;

          for (const msg of messages) {
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: ["From", "Subject"],
            });

            const headers = detail.data.payload.headers;
            const from = headers.find((h) => h.name === "From")?.value || "Unknown";
            const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";

            emailText += `*From:* ${from}\n*Subject:* ${subject}\n\n`;

            // Attachments (Gmail)
            const attachments = await listGmailAttachments(userId, msg.id);
            if (attachments.length) {
              attachments.forEach((att) => {
                const url = `${process.env.BASE_URL}/attachment/gmail/${msg.id}/${att.id}?user=${userId}&filename=${encodeURIComponent(att.filename)}&type=${encodeURIComponent(att.mimeType)}`;
                emailText += `📎 <${url}|${att.filename}> (${Math.round(att.size / 1024)} KB)\n\n`;
              });
            }
          }

          await respond(emailText);
        } catch (err) {
          console.error("Gmail fetch error:", err);
          await respond("❌ Gmail not connected or error fetching emails. Use `/connect-email` first.");
        }
      } else {
        const user = await getUser(userId);

        if (!user || !user.microsoft_access_token) {
          await respond("❌ Microsoft/Outlook not connected. Use `/connect-email` first.");
          return;
        }

        try {
          const response = await axios.get(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=5&$select=id,from,subject,receivedDateTime&$orderby=receivedDateTime desc",
            {
              headers: {
                Authorization: `Bearer ${user.microsoft_access_token}`,
              },
            }
          );

          const messages = response.data.value || [];

          if (messages.length === 0) {
            await respond("✅ No emails found in Outlook inbox.");
            return;
          }

          let emailText = `📧 *Outlook (last ${messages.length})*\n\n`;

          for (const msg of messages) {
            const from = msg.from?.emailAddress?.address || "Unknown";
            const subject = msg.subject || "No Subject";

            emailText += `*From:* ${from}\n*Subject:* ${subject}\n\n`;

            const attachments = await listOutlookAttachments(userId, msg.id);
            if (attachments.length) {
              attachments.forEach((att) => {
                const url = `${process.env.BASE_URL}/attachment/outlook/${msg.id}/${att.id}?user=${userId}&filename=${encodeURIComponent(att.filename)}&type=${encodeURIComponent(att.mimeType)}`;
                emailText += `📎 <${url}|${att.filename}> (${Math.round(att.size / 1024)} KB)\n\n`;
              });
            }
          }

          await respond(emailText);
        } catch (err) {
          console.error("Outlook fetch error:", err);
          await respond("❌ Error fetching Outlook emails. Token may be expired.");
        }
      }
    } catch (err) {
      console.error("get-emails error:", err);
      await respond("❌ Error fetching emails. Please try again later.");
    }
  });

  app.command("/send-email", async ({ ack, command, body, client }) => {
    await ack();

    // ✅ Bot exclusive - DM only
    if (command.channel_name !== "directmessage") {
      await client.chat.postMessage({
        channel: command.user_id,
        text: "🔒 This command only works in DMs with the bot.",
      });
      return;
    }

    // Open modal with form
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "send_email_modal",
        title: {
          type: "plain_text",
          text: "Send Email",
        },
        submit: {
          type: "plain_text",
          text: "Send",
        },
        blocks: [
          {
            type: "input",
            block_id: "provider_block",
            label: {
              type: "plain_text",
              text: "Email Provider",
            },
            element: {
              type: "static_select",
              action_id: "provider_select",
              options: [
                {
                  text: { type: "plain_text", text: "Gmail" },
                  value: "google",
                },
                {
                  text: { type: "plain_text", text: "Outlook" },
                  value: "microsoft",
                },
              ],
            },
          },
          {
            type: "input",
            block_id: "recipient_block",
            label: {
              type: "plain_text",
              text: "Recipient Email",
            },
            element: {
              type: "plain_text_input",
              action_id: "recipient_input",
              placeholder: {
                type: "plain_text",
                text: "recipient@example.com",
              },
            },
          },
          {
            type: "input",
            block_id: "subject_block",
            label: {
              type: "plain_text",
              text: "Subject",
            },
            element: {
              type: "plain_text_input",
              action_id: "subject_input",
              placeholder: {
                type: "plain_text",
                text: "Email subject",
              },
            },
          },
          {
            type: "input",
            block_id: "body_block",
            label: {
              type: "plain_text",
              text: "Email Body",
            },
            element: {
              type: "plain_text_input",
              action_id: "body_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Write your email here...",
              },
            },
          },
          {
            type: "input",
            block_id: "attachments_block",
            optional: true,
            label: {
              type: "plain_text",
              text: "Attachments (URLs, one per line)",
            },
            element: {
              type: "plain_text_input",
              action_id: "attachments_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "https://example.com/file.pdf\nhttps://example.com/image.png",
              },
            },
          },
          {
            type: "input",
            block_id: "send_later_block",
            optional: true,
            label: {
              type: "plain_text",
              text: "Send later (ISO datetime, UTC)",
            },
            element: {
              type: "plain_text_input",
              action_id: "send_later_input",
              placeholder: {
                type: "plain_text",
                text: "2026-02-08T09:30:00Z",
              },
            },
          },
        ],
      },
    });
  });
}

function registerViews(app) {
  console.log("✅ Registering view handlers...");
  // Simple in-memory scheduler (lost on restart)
  const scheduledJobs = new Set();
  
  // Debug: Log all incoming requests
  app.use(async ({ body, next }) => {
    if (body.type === "view_submission") {
      console.log("🔍 View submission detected:", body.view?.callback_id);
    }
    await next();
  });

  app.view("send_email_modal", async ({ ack, body, view, client }) => {
    console.log("📨 View submission received");
    
    // Acknowledge the submission first
    await ack();

    const userId = body.user.id;
    const values = view.state.values;

    try {
      // Extract form values
      const provider = values.provider_block?.provider_select?.selected_option?.value;
      const recipientEmail = values.recipient_block?.recipient_input?.value;
      const subject = values.subject_block?.subject_input?.value;
      const emailBody = values.body_block?.body_input?.value;
      const attachmentsRaw = values.attachments_block?.attachments_input?.value || "";
      const attachmentUrls = attachmentsRaw
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean);
      const sendLaterRaw = values.send_later_block?.send_later_input?.value?.trim() || "";

      let delayMs = 0;
      if (sendLaterRaw) {
        const ts = Date.parse(sendLaterRaw);
        if (Number.isNaN(ts)) {
          await client.chat.postMessage({
            channel: userId,
            text: "❌ Invalid date/time. Use ISO like 2026-02-08T09:30:00Z",
          });
          return;
        }
        delayMs = ts - Date.now();
        if (delayMs < 0) delayMs = 0;
      }

      console.log("Form data extracted:", { provider, recipientEmail, subject: subject?.substring(0, 20) });

      // Validate inputs
      if (!provider) {
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Please select an email provider.",
        });
        return;
      }

      if (!recipientEmail || !subject || !emailBody) {
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Please fill in all fields (recipient, subject, body).",
        });
        return;
      }

      const doSend = async () => {
        console.log(`Attempting to send email via ${provider}...`);
        const result = await sendEmail(
          userId,
          provider,
          recipientEmail,
          subject,
          emailBody,
          attachmentUrls
        );
        await client.chat.postMessage({
          channel: userId,
          text: `✅ Email sent${delayMs ? " (scheduled)" : ""} via ${result.provider}!\n\nTo: ${recipientEmail}\nSubject: ${subject}`,
        });
      };

      if (delayMs > 0) {
        const timer = setTimeout(() => {
          scheduledJobs.delete(timer);
          void doSend();
        }, delayMs);
        scheduledJobs.add(timer);
        await client.chat.postMessage({
          channel: userId,
          text: `⏳ Email scheduled for ${new Date(Date.now() + delayMs).toISOString()}`,
        });
      } else {
        await doSend();
      }

    } catch (error) {
      console.error("Email send failed:", error.message);
      
      // Send error message to user
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Failed to send email: ${error.message}`,
      });
    }
  });
}

export { registerCommands, registerViews };
