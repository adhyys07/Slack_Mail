import axios from "axios";
import { google } from "googleapis";
import { getUser, saveUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { sendEmail, ensureMicrosoftAccessToken } from "../services/emailSender.js";
import { listGmailAttachments, listOutlookAttachments } from "../services/attachments.js";
import {
  listCustomEmails,
  normalizeCustomMailConfig,
  openCustomEmail,
  searchCustomEmails,
  testCustomInboxConnection,
} from "../services/customMail.js";
import { getCustomMailPreset } from "../utils/customMailPresets.js";

const GOOGLE_PROVIDERS = ["google", "gmail"];
const MICROSOFT_PROVIDERS = ["microsoft", "outlook"];
const CUSTOM_PROVIDERS = ["custom", "imap"];
const ALL_PROVIDERS = [...GOOGLE_PROVIDERS, ...MICROSOFT_PROVIDERS, ...CUSTOM_PROVIDERS];

function normalizeProvider(provider) {
  if (GOOGLE_PROVIDERS.includes(provider)) return "google";
  if (MICROSOFT_PROVIDERS.includes(provider)) return "microsoft";
  if (CUSTOM_PROVIDERS.includes(provider)) return "custom";
  return "";
}

function registerCommands(app) {
  app.command("/connect-email", async ({ ack, command, respond }) => {
    await ack();

    const googleAuthUrl = `${process.env.BASE_URL}/auth/google?user=${command.user_id}`;
    const microsoftAuthUrl = `${process.env.BASE_URL}/auth/microsoft?user=${command.user_id}`;

    await respond({
      response_type: "in_channel",
      text: "Connect your email",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🔐 Click below to connect your email account.",
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
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Custom Domain" },
              action_id: "connect_custom_email",
            },
          ],
        },
      ],
    });
  });

  app.action("connect_custom_email", async ({ ack, body, client }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "custom_email_simple_modal",
        title: { type: "plain_text", text: "Custom Email" },
        submit: { type: "plain_text", text: "Continue" },
        blocks: [
          {
            type: "input",
            block_id: "email_block",
            label: { type: "plain_text", text: "Email address" },
            element: {
              type: "plain_text_input",
              action_id: "email_input",
              placeholder: { type: "plain_text", text: "you@yourdomain.com" },
            },
          },
          {
            type: "input",
            block_id: "provider_block",
            label: { type: "plain_text", text: "Email host" },
            element: {
              type: "static_select",
              action_id: "provider_select",
              options: [
                {
                  text: { type: "plain_text", text: "Zoho Mail" },
                  value: "zoho",
                },
                {
                  text: { type: "plain_text", text: "Google Workspace" },
                  value: "google_workspace",
                },
                {
                  text: { type: "plain_text", text: "Microsoft 365" },
                  value: "microsoft_365",
                },
                {
                  text: { type: "plain_text", text: "Namecheap Private Email" },
                  value: "namecheap",
                },
                {
                  text: { type: "plain_text", text: "cPanel / Webmail" },
                  value: "cpanel",
                },
              ],
            },
          },
        ],
      },
    });
  });

  app.command("/check-accounts", async ({ ack, command, respond }) => {
    await ack();

    try {
      const userId = command.user_id;
      const userMail = await getUser(userId);

      let googleStatus = "❌ Not connected";
      try {
        const googleTokens = await getGoogleTokens(userId);
        if (googleTokens) googleStatus = "✅ Connected";
      } catch (err) {
        googleStatus = "❌ Not connected";
      }

      let microsoftStatus = "❌ Not connected";
      if (userMail && userMail.microsoft_provider === "microsoft" && userMail.microsoft_refresh_token) {
        try {
          await ensureMicrosoftAccessToken(userId);
          microsoftStatus = "✅ Connected";
        } catch (e) {
          microsoftStatus = "❌ Not connected";
        }
      }

      const customStatus = userMail?.custom_mail
        ? `Connected (${userMail.custom_mail.email})`
        : "Not connected";

      await respond({
        response_type: "in_channel",
        text: "Email Account Status",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📧 *Email Account Status*\n\n*Gmail:* ${googleStatus}\n*Microsoft/Outlook:* ${microsoftStatus}\n*Custom Domain:* ${customStatus}`,
            },
          },
        ],
      });
    } catch (err) {
      console.error("check-accounts error:", err);
      await respond({ response_type: "in_channel", text: "❌ Error checking accounts. Please try again later." });
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

  app.command("/open-email", async ({ ack, command, respond, client }) => {
    await ack();
    const [providerRaw, indexRaw] = (command.text || "").trim().split(/\s+/);
    const provider = (providerRaw || "").toLowerCase();
    const idx = Math.min(5, Math.max(1, Number(indexRaw) || 1));

    const normalizedProvider = normalizeProvider(provider);

    if (!normalizedProvider) {
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Use: `/open-email gmail 1` or `/open-email outlook 2` (1–5)" });
      return;
    }

    try {
      if (normalizedProvider === "google") {
        const oauth2Client = await ensureGoogleAuth(command.user_id);
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const list = await gmail.users.messages.list({
          userId: "me",
          q: "category:primary",
          maxResults: 5,
        });

        const messages = list.data.messages || [];
        const msgMeta = messages[idx - 1];
        if (!msgMeta) {
          await client.chat.postMessage({ channel: command.channel_id, text: `❌ No email found at index ${idx} in Gmail.` });
          return;
        }

        const full = await gmail.users.messages.get({
          userId: "me",
          id: msgMeta.id,
          format: "full",
        });

        const headers = full.data.payload.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        const textRaw =
          extractGmailPlainText(full.data.payload) || full.data.snippet || "(No body available)";
        const text = shortenLinks(textRaw);

        await client.chat.postMessage({ channel: command.channel_id, text: `*From:* ${from}\n*Subject:* ${subject}\n*Date:* ${date}\n\n${text.slice(0, 4000)}` });
      } else if (normalizedProvider === "microsoft") {
        const msAccessToken = await ensureMicrosoftAccessToken(command.user_id);

        const list = await axios.get(
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=5&$select=id,from,subject,receivedDateTime&$orderby=receivedDateTime%20desc",
          {
            headers: { Authorization: `Bearer ${msAccessToken}` },
          }
        );

        const messages = list.data.value || [];
        const msgMeta = messages[idx - 1];
        if (!msgMeta) {
          await client.chat.postMessage({ channel: command.channel_id, text: `❌ No email found at index ${idx} in Outlook.` });
          return;
        }

        const detail = await axios.get(
          `https://graph.microsoft.com/v1.0/me/messages/${msgMeta.id}?$select=from,subject,receivedDateTime,body`,
          {
            headers: { Authorization: `Bearer ${msAccessToken}` },
          }
        );

        const from = detail.data.from?.emailAddress?.address || "Unknown";
        const subject = detail.data.subject || "No Subject";
        const date = detail.data.receivedDateTime || "";
        const bodyContent = detail.data.body?.content || "";
        const textRaw = (detail.data.body?.contentType || "").toLowerCase() === "html"
          ? stripHtml(bodyContent)
          : bodyContent;
        const text = shortenLinks(textRaw || "(No body available)");

        await client.chat.postMessage({ channel: command.channel_id, text: `*From:* ${from}\n*Subject:* ${subject}\n*Date:* ${date}\n\n${text.slice(0, 4000)}` });
      } else {
        const message = await openCustomEmail(command.user_id, idx);
        if (!message) {
          await client.chat.postMessage({ channel: command.channel_id, text: `No email found at index ${idx} in your custom inbox.` });
          return;
        }
        const text = shortenLinks(message.text || stripHtml(message.html) || "(No body available)");
        await client.chat.postMessage({
          channel: command.channel_id,
          text: `*From:* ${message.from}\n*Subject:* ${message.subject}\n*Date:* ${message.date || ""}\n\n${text.slice(0, 4000)}`,
        });
      }
    } catch (err) {
      console.error("open-email error:", err.message);
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Error opening email. Please try again." });
    }
  });
  app.command("/reply-email",async ({ ack, command, client }) => {
    await ack();
    const [providerRaw, idxRaw, ...rest] = (command.text || "").trim().split(/\s+/);
    const provider = (providerRaw || "").toLowerCase();
    const idx = Math.min(5, Math.max(1, Number(idxRaw) || 1));
    const bodyText = rest.join(" ").trim();

    const normalizedProvider = normalizeProvider(provider);

    if (!normalizedProvider || !bodyText ) {
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Use: `/reply-email gmail 1 Your reply here`" });
      return;
    }

    try {
      if (normalizedProvider === "google") {
        const oauth2Client = await ensureGoogleAuth(command.user_id);
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const list = await gmail.users.messages.list({
          userId: "me",
          q: "category:primary",
          maxResults: 5,
        });
        const messages = list.data.messages || [];
        const msgMeta = messages[idx - 1];
        if (!msgMeta) {
          await client.chat.postMessage({ channel: command.channel_id, text: `❌ No email found at index ${idx} in Gmail.` });
          return;
        }

        const full = await gmail.users.messages.get({
          userId: "me",
          id: msgMeta.id,
          format: "full"
        });
        const headers = full.data.payload.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const inReplyTo = headers.find((h) => h.name === "Message-ID")?.value;
        const refs = headers.find((h) => h.name === "References")?.value || "";

        const rawLines = [
          `To: ${headers.find((h) => h.name === "Reply-To")?.value || headers.find((h) => h.name === "From")?.value || ""}`,
          `Subject: Re: ${subject}`,
          `In-Reply-To: ${inReplyTo || ""}`,
          `References: ${refs}`,
          "Content-Type: text/plain; charset=\"UTF-8\"",
          "",
        bodyText,
      ];
      const raw = Buffer.from(rawLines.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, threadId: full.data.threadId }
    });
      await client.chat.postMessage({ channel: command.channel_id, text: "✅ Reply sent via Gmail!" });
      } else if (normalizedProvider === "microsoft") {
        const msAccessToken = await ensureMicrosoftAccessToken(command.user_id);

        const list = await axios.get(
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=5&$select=id,from,subject,conversationId&$orderby=receivedDateTime desc",
          {headers: { Authorization: `Bearer ${msAccessToken}` }}
        );
        const messages = list.data.value || [];
        const msgMeta = messages[idx - 1];
        if (!msgMeta) {
          await client.chat.postMessage({ channel: command.channel_id, text: `❌ No email found at index ${idx} in Outlook.` });
          return;
        }

        await axios.post(
          `https://graph.microsoft.com/v1.0/me/messages/${msgMeta.id}/reply`,
          { comment: bodyText },
          { headers: { Authorization: `Bearer ${msAccessToken}` } }
        );
        await client.chat.postMessage({ channel: command.channel_id, text: "✅ Reply sent via Outlook!" });
      }
      if (normalizedProvider === "custom") {
        const message = await openCustomEmail(command.user_id, idx);
        const recipient = message?.replyTo || message?.fromEmail;
        if (!message || !recipient) {
          await client.chat.postMessage({ channel: command.channel_id, text: `No reply target found at index ${idx} in your custom inbox.` });
          return;
        }
        await sendEmail(command.user_id, "custom", recipient, `Re: ${message.subject}`, bodyText);
        await client.chat.postMessage({ channel: command.channel_id, text: "Reply sent via custom SMTP!" });
      }
    } catch (err) {
      console.error("reply-email error:", err.message);
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Error sending reply. Please try again." });
    }
  });

  app.command("/get-emails", async ({ command, ack, respond, client }) => {
    await ack();

    try {
      const userId = command.user_id;
      const parts = (command.text || "").trim().split(/\s+/).filter(Boolean);
      const provider = (parts[0] || "").toLowerCase();
      const pageSize = Math.min(50, Math.max(1, Number(parts[1]) || 5));
      const uploadFlag = parts.includes("upload");
      const cursor = parts.find((p, idx) => idx > 1 && p !== "upload") || "";

      if (!provider || !ALL_PROVIDERS.includes(provider)) {
        await client.chat.postMessage({ channel: command.channel_id, text: "❌ Please specify a provider: `/get-emails google` or `/get-emails microsoft`" });
        return;
      }

      const normalizedProvider = normalizeProvider(provider);

      if (normalizedProvider === "google") {
        try {
          const oauth2Client = await ensureGoogleAuth(userId);
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          const response = await gmail.users.messages.list({
            userId: "me",
            q: "category:primary",
            maxResults: pageSize,
            pageToken: cursor || undefined,
          });

          const messages = response.data.messages || [];
          const nextToken = response.data.nextPageToken;

          if (messages.length === 0) {
            await client.chat.postMessage({ channel: command.channel_id, text: "✅ No emails found in Gmail primary inbox." });
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

              if (uploadFlag) {
                for (const att of attachments) {
                  try {
                    const buf = await fetchGmailAttachmentBody(gmail, msg.id, att.id);
                    await uploadToSlackFile(client, command.channel_id, att.filename, att.mimeType, buf);
                  } catch (e) {
                    console.error("Gmail attachment upload error:", e.message);
                  }
                }
              }
            }
          }

          if (nextToken) {
            emailText += `➡️ Next page: /get-emails gmail ${pageSize} ${nextToken}\n\n`;
          }

          await client.chat.postMessage({ channel: command.channel_id, text: emailText });
        } catch (err) {
          console.error("Gmail fetch error:", err);
          await client.chat.postMessage({ channel: command.channel_id, text: "❌ Gmail not connected or error fetching emails. Use `/connect-email` first." });
        }
      } else if (normalizedProvider === "microsoft") {
        try {
          const msAccessToken = await ensureMicrosoftAccessToken(userId);
          const response = await axios.get(
            `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${pageSize}&$select=id,from,subject,receivedDateTime&$orderby=receivedDateTime desc${cursor ? `&$skiptoken=${encodeURIComponent(cursor)}` : ""}`,
            {
              headers: {
                Authorization: `Bearer ${msAccessToken}`,
              },
            }
          );

          const messages = response.data.value || [];
          const nextLink = response.data["@odata.nextLink"] || "";
          const nextTokenMatch = nextLink.match(/\$skiptoken=([^&]+)/);
          const nextToken = nextTokenMatch ? decodeURIComponent(nextTokenMatch[1]) : "";

          if (messages.length === 0) {
            await client.chat.postMessage({ channel: command.channel_id, text: "✅ No emails found in Outlook inbox." });
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

              if (uploadFlag) {
                for (const att of attachments) {
                  if (att["@odata.type"] && att["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
                  try {
                    const { data, contentType } = await fetchOutlookAttachmentBody(msAccessToken, msg.id, att.id);
                    await uploadToSlackFile(client, command.channel_id, att.filename || att.name, contentType || att.mimeType, data);
                  } catch (e) {
                    console.error("Outlook attachment upload error:", e.message);
                  }
                }
              }
            }
          }

          if (nextToken) {
            emailText += `➡️ Next page: /get-emails outlook ${pageSize} ${nextToken}\n\n`;
          }

          await client.chat.postMessage({ channel: command.channel_id, text: emailText });
        } catch (err) {
          console.error("Outlook fetch error:", err);
          await client.chat.postMessage({ channel: command.channel_id, text: "❌ Error fetching Outlook emails. Token may be expired." });
        }
      } else {
        try {
          const messages = await listCustomEmails(userId, pageSize);
          if (!messages.length) {
            await client.chat.postMessage({ channel: command.channel_id, text: "No emails found in your custom inbox." });
            return;
          }

          let emailText = `*Custom inbox (last ${messages.length})*\n\n`;
          messages.forEach((msg, index) => {
            emailText += `${index + 1}. *From:* ${msg.from}\n*Subject:* ${msg.subject}\n\n`;
          });
          await client.chat.postMessage({ channel: command.channel_id, text: emailText });
        } catch (err) {
          console.error("Custom inbox fetch error:", err);
          await client.chat.postMessage({ channel: command.channel_id, text: "Error fetching custom inbox. Check your IMAP settings with /connect-email." });
        }
      }
    } catch (err) {
      console.error("get-emails error:", err);
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Error fetching emails. Please try again later." });
    }
  });

  app.command("/search-email", async ({ command, ack, client }) => {
    await ack();
    const [providerRaw, ...queryParts] = (command.text || "").trim().split(/\s+/);
    const provider = (providerRaw || "").toLowerCase();
    const query = queryParts.join(" ").trim();
    const normalizedProvider = normalizeProvider(provider);

    if (!normalizedProvider || !query) {
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Use: `/search-email google your search query`" });
      return;
    }

    try{
      if (normalizedProvider === "google") {
        const oauth2Client = await ensureGoogleAuth(command.user_id);
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const response = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: 5,
        });
        const messages = response.data.messages || [];
        if (!messages.length) {
          await client.chat.postMessage({ channel: command.channel_id, text: "✅ No matching emails found in Gmail." });
          return;
        }
        let text = `🔎 *Gmail search* (“${query}”) — ${messages.length} found (showing up to 5)\n\n`;
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "metadata",
            metadataHeaders: ["From", "Subject"],
          });
          const headers = detail.data.payload.headers;
          const from = headers.find((h) => h.name === "From")?.value || "Unknown";
          const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
          text += `${i+1}. *From:* ${from}\n   *Subject:* ${subject}\n   → /open-email gmail ${i+1}\n\n`;
        }
        await client.chat.postMessage({ channel: command.channel_id, text });
      } else if (normalizedProvider === "microsoft") {
        const msAccessToken = await ensureMicrosoftAccessToken(command.user_id);
        const resp = await axios.get(
          `https://graph.microsoft.com/v1.0/me/messages?$search="${query}"&$top=5&$select=id,from,subject,receivedDateTime`,
          { headers: { Authorization: `Bearer ${msAccessToken}` } }
        );
        const messages = resp.data.value || [];
        if (!messages.length) {
          await client.chat.postMessage({ channel: command.channel_id, text: "✅ No matching emails found in Outlook." });
          return;
        }
        let text = `🔎 *Outlook search* (“${query}”) — ${messages.length} found (showing up to 5)\n\n`;
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const from = msg.from?.emailAddress?.address || "Unknown";
          const subject = msg.subject || "No Subject";
          text += `${i+1}. *From:* ${from}\n   *Subject:* ${subject}\n   → /open-email outlook ${i+1}\n\n`;
        }
        await client.chat.postMessage({ channel: command.channel_id, text });
      } else {
        const messages = await searchCustomEmails(command.user_id, query, 5);
        if (!messages.length) {
          await client.chat.postMessage({ channel: command.channel_id, text: "No matching emails found in your custom inbox." });
          return;
        }
        let text = `*Custom inbox search* ("${query}") - ${messages.length} found\n\n`;
        messages.forEach((msg, index) => {
          text += `${index + 1}. *From:* ${msg.from}\n   *Subject:* ${msg.subject}\n   -> /open-email custom ${index + 1}\n\n`;
        });
        await client.chat.postMessage({ channel: command.channel_id, text });
      }
      await client.chat.postMessage({ channel: command.channel_id, text: "✅ Search completed." });
    } catch (err) {
      console.error("search-email error:", err.response?.data || err.message);
      await client.chat.postMessage({ channel: command.channel_id, text: "❌ Error searching emails. Please try again later." });
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
                {
                  text: { type: "plain_text", text: "Custom Domain" },
                  value: "custom",
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
            block_id: "cc_block",
            optional: true,
            label: {
              type: "plain_text",
              text: "CC",
            },
            element: {
              type: "plain_text_input",
              action_id: "cc_input",
              placeholder: {
                type: "plain_text",
                text: "cc@example.com, teammate@example.com",
              },
            },
          },
          {
            type: "input",
            block_id: "bcc_block",
            optional: true,
            label: {
              type: "plain_text",
              text: "BCC",
            },
            element: {
              type: "plain_text_input",
              action_id: "bcc_input",
              placeholder: {
                type: "plain_text",
                text: "hidden@example.com",
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
function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function shortenLinks(text) {
  if (!text) return "";
  return text.replace(/https?:\/\/\S+/gi, (url) => `<${url}|link>`);
}

function parseEmailList(value = "") {
  return String(value)
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureGoogleAuth(userId) {
  const oauth2Client = await getGoogleTokens(userId);
  try {
    const { token } = await oauth2Client.getAccessToken();
    if (token) {
      const user = await getUser(userId);
      await saveUser(userId, {
        ...user,
        google_tokens: { ...oauth2Client.credentials, access_token: token },
        google_access_token: token,
        google_refresh_token:
          oauth2Client.credentials.refresh_token || user?.google_refresh_token,
      });
    }
  } catch (err) {
    console.error("Google token refresh failed:", err.message);
  }
  return oauth2Client;
}

async function uploadToSlackFile(client, channel, filename, mimeType, dataBuffer) {
  await client.files.uploadV2({
    channel_id: channel,
    filename: filename || "attachment",
    title: filename || "attachment",
    alt_text: filename || "attachment",
    content_type: mimeType || "application/octet-stream",
    file: dataBuffer,
  });
}

async function fetchGmailAttachmentBody(gmail, messageId, attachmentId) {
  const attResp = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = attResp.data?.data || "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function fetchOutlookAttachmentBody(accessToken, messageId, attachmentId) {
  const resp = await axios.get(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}/$value`,
    {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return { data: Buffer.from(resp.data), contentType: resp.headers["content-type"] };
}

function extractGmailPlainText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const text = extractGmailPlainText(p);
      if (text) return text;
    }
  }
  return "";
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

  app.view("custom_email_simple_modal", async ({ ack, body, view, client }) => {
    const values = view.state.values;

    try {
      const email = values.email_block?.email_input?.value?.trim();
      const provider = values.provider_block?.provider_select?.selected_option?.value;
      const preset = getCustomMailPreset(provider, email);

      if (!preset) {
        await ack({
          response_action: "errors",
          errors: {
            email_block: "Enter a valid email address and choose an email host.",
          },
        });
        return;
      }

      await ack({
        response_action: "push",
        view: {
          type: "modal",
          callback_id: "custom_email_password_modal",
          private_metadata: JSON.stringify(preset),
          title: { type: "plain_text", text: "Email Password" },
          submit: { type: "plain_text", text: "Connect" },
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text:
                  `Connecting *${preset.email}* using *${preset.label}*.\n` +
                  `IMAP: ${preset.imapHost}:${preset.imapPort}\n` +
                  `SMTP: ${preset.smtpHost}:${preset.smtpPort}`,
              },
            },
            {
              type: "input",
              block_id: "password_block",
              label: { type: "plain_text", text: "Password or app password" },
              element: {
                type: "plain_text_input",
                action_id: "password_input",
              },
            },
          ],
        },
      });
    } catch (err) {
      console.error("custom_email_simple_modal error:", err.message);
      await ack({
        response_action: "errors",
        errors: {
          email_block: "Could not continue custom email setup.",
        },
      });
    }
  });

  app.view("custom_email_password_modal", async ({ ack, body, view, client }) => {
    const userId = body.user.id;
    let acknowledged = false;

    try {
      const preset = JSON.parse(view.private_metadata || "{}");
      const password = view.state.values.password_block?.password_input?.value;
      const config = normalizeCustomMailConfig({
        ...preset,
        password,
      });

      await ack();
      acknowledged = true;

      const verifiedConfig = await testCustomInboxConnection(config);
      const existing = await getUser(userId);
      await saveUser(userId, {
        ...existing,
        custom_mail: verifiedConfig,
      });

      await client.chat.postMessage({
        channel: userId,
        text: `Custom email connected for ${verifiedConfig.email}. Use /get-emails custom to read it.`,
      });
    } catch (err) {
      if (!acknowledged) {
        await ack({
          response_action: "errors",
          errors: {
            password_block: err.message || "Could not connect using this password.",
          },
        });
        return;
      }

      await client.chat.postMessage({
        channel: userId,
        text: `Custom email connection failed: ${err.message}`,
      });
    }
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
      const cc = parseEmailList(values.cc_block?.cc_input?.value || "");
      const bcc = parseEmailList(values.bcc_block?.bcc_input?.value || "");
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
          attachmentUrls,
          { cc, bcc }
        );
        const ccLine = cc.length ? `\nCC: ${cc.join(", ")}` : "";
        const bccLine = bcc.length ? `\nBCC: ${bcc.join(", ")}` : "";
        await client.chat.postMessage({
          channel: userId,
          text: `✅ Email sent${delayMs ? " (scheduled)" : ""} via ${result.provider}!\n\nTo: ${recipientEmail}${ccLine}${bccLine}\nSubject: ${subject}`,
        });
      };

      if (delayMs > 0) {
        const timer = setTimeout(() => {
          scheduledJobs.delete(timer);
          void doSend();
        }, delayMs);
        scheduledJobs.add(timer);
        const ccLine = cc.length ? `\nCC: ${cc.join(", ")}` : "";
        const bccLine = bcc.length ? `\nBCC: ${bcc.join(", ")}` : "";
        await client.chat.postMessage({
          channel: userId,
          text: `⏳ Email scheduled for ${new Date(Date.now() + delayMs).toISOString()}\n\nTo: ${recipientEmail}${ccLine}${bccLine}\nSubject: ${subject}`,
        });
      } else {
        await doSend();
      }

    } catch (error) {
      console.error("Email send failed:", error.message);
      
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Failed to send email: ${error.message}`,
      });
    }
  });
}

export { registerCommands, registerViews };
