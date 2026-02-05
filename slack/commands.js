import axios from "axios";
import { google } from "googleapis";
import { getUser } from "../db/store.js";
import { getGoogleTokens } from "../providers/googleTokens.js";
import { fetchGmail } from "../providers/gmail.js";

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

  app.command("/send-emails", async ({ ack, command, body, client }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type:"modal",
        callback_id: "send_email_modal",
        title:{
          type:"plain_text",
          text:"Send Email",
        },
        submit:{
          type: "plain_text",
          test:"send",
        },
        blocks:[
          {
            type:"input",
            block_id:"provider_block",
            label:{
              type:"plain_text",
              text:"Select Email Provider",
            },
            element:{
              type:"static_select",
              action_id:"provider_action",
            options:[
              {
                text:{ type:"plain_text", text:"Gmail" },
                value:"gmail",
            },
            {
                text:{ type:"plain_text", text:"Outlook" },
                value:"outlook",
            },
          ],
        },
      },
      {
        type:"input",
        block_id:"recipient_block",
        label:{
          type:"plain_text",
          text:"Recipient Email Address",
        },
        element:{
          type:"plain_text_input",
          action_id:"recipient_input",
          placeholder:{
            type:"plain_text",
            text:"recipient@example.com",
          },
        },
        },
        {
          type:"input",
          block_id:"subject_block",
          label:{
            type:"plain_text",
            text:"Email Subject",
          },
          element:{
            type:"plain_text_input",
            action_id:"subject_input",
            placeholder:{
              type:"plain_text",
              text:"Email Subject",
        },
        },
        },
        {          
          type:"input",
          block_id:"body_block",
          label:{
            type:"plain_text",
            text:"Email Body",
          },
          element:{
            type:"plain_text_input",
            action_id:"body_input",
            multiline:true,
            placeholder:{
              type:"plain_text",
              text:"Write your email content here...",
            },
          },
        },
      ],
    },
  });
});

app.view("send_email_modal", async ({ ack, body, view, client }) => {
  await ack();

  try{
    const userId = body.user.id;
    const values = view.state.values;

    const provider = values.provider_block.provider_select.selected_option.value;
    const recipientEmail = values.recipient_block.recipient_input_value;
    const subject = values.subject_block.subject_input.value;
    const emailBody = values.body_block.body_input.value;

    if (!recipientEmail || !subject || !emailBody){
      await client.chat.postMessage({
        channel:userId , 
        text: "Please fill in all fields",
      });
      return;
    }

    if (provider === "google"){
      try{
        const oauth2Client= await getGoogleTokens(userId);
        const gmail= google.gmail({version : "v1", auth:oauth2Client});

        const messsage = [
          `To: ${recipientEmail}`,
          "Subject: " + subject,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "",
          emailBody,

        ].join("\n")

        const encodedMessage = Buffer.from(message).toString("base64");

        await gmail.user.messages.send({
          userId: "me",
          requestBody:{
            raw: encodedMessage
          },
        });

        await client.chat.postMessage({
          channel:userId,
          text:`Email sent successfully via Gmail to ${recipientEmail}`,
        });
      } catch (err) {
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Failed to send email via Gmail.",
        });
      }
    } else{
      const user = await getUser(userId);

      if(!user || !user.microsoft_access_token) {
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Microsoft/Outlook not connected. Use `/connect-email` first.",
        });
        return;
      }
      try{
        await axios.post(
          "https://graph.microsoft.com/v1.0/me/sendMail",
          {
            message:{
              subject: subject,
              body:{
                contentType: "text/plain",
                content: emailBody,
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
              headers:{
                Authorization: `Bearer ${user.microsoft_access_token}`,
                "Content-Type": "application/json",
              },
            }
        );
        await client.chat.postMessage({
          channel: userId,
          text: `Email sent successfully via Outlook to ${recipientEmail}`,
        });
      } catch(err){
        console.error("Error sending Outlook email:", err);
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Failed to send email via Outlook.",
        });
      }
    }
  } catch (err) {
    console.error("Error handling send email modal submission:", err);
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
            q: "is:unread category:primary",
            maxResults: 5,
          });

          const messages = response.data.messages || [];

          if (messages.length === 0) {
            await respond("✅ No unread emails in Gmail primary inbox!");
            return;
          }

          let emailText = `📧 *Unread Gmail (${messages.length})*\n\n`;

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
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=5&$select=from,subject,receivedDateTime",
            {
              headers: {
                Authorization: `Bearer ${user.microsoft_access_token}`,
              },
            }
          );

          const messages = response.data.value || [];

          if (messages.length === 0) {
            await respond("✅ No unread emails in Outlook inbox!");
            return;
          }

          let emailText = `📧 *Unread Outlook (${messages.length})*\n\n`;

          for (const msg of messages) {
            const from = msg.from?.emailAddress?.address || "Unknown";
            const subject = msg.subject || "No Subject";

            emailText += `*From:* ${from}\n*Subject:* ${subject}\n\n`;
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
        ],
      },
    });
  });
}

function registerViews(app) {
  app.view("send_email_modal", async ({ ack, body, view, client }) => {
    await ack();

    try {
      const userId = body.user.id;
      const values = view.state.values;

      console.log("Modal values:", JSON.stringify(values, null, 2));

      const providerOption = values.provider_block?.provider_select?.selected_option;
      if (!providerOption) {
        console.error("No provider selected");
        return;
      }

      const provider = providerOption.value;
      const recipientEmail = values.recipient_block?.recipient_input?.value;
      const subject = values.subject_block?.subject_input?.value;
      const emailBody = values.body_block?.body_input?.value;

      console.log("Extracted:", { provider, recipientEmail, subject, emailBody });

      if (!recipientEmail || !subject || !emailBody) {
        await client.chat.postMessage({
          channel: userId,
          text: "❌ Please fill in all fields.",
        });
        return;
      }

      if (provider === "google") {
        try {
          const oauth2Client = await getGoogleTokens(userId);
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          const message = [
            `To: ${recipientEmail}`,
            "Subject: " + subject,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=UTF-8",
            "",
            emailBody,
          ].join("\n");

          const encodedMessage = Buffer.from(message).toString("base64");

          await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: encodedMessage,
            },
          });

          await client.chat.postMessage({
            channel: userId,
            text: `✅ Email sent successfully via Gmail to ${recipientEmail}`,
          });
        } catch (err) {
          console.error("Gmail send error:", err);
          await client.chat.postMessage({
            channel: userId,
            text: "❌ Failed to send email via Gmail.",
          });
        }
      } else {
        const user = await getUser(userId);

        if (!user || !user.microsoft_access_token) {
          await client.chat.postMessage({
            channel: userId,
            text: "❌ Microsoft/Outlook not connected. Use `/connect-email` first.",
          });
          return;
        }

        try {
          await axios.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            {
              message: {
                subject: subject,
                body: {
                  contentType: "text/plain",
                  content: emailBody,
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
                Authorization: `Bearer ${user.microsoft_access_token}`,
                "Content-Type": "application/json",
              },
            }
          );

          await client.chat.postMessage({
            channel: userId,
            text: `✅ Email sent successfully via Outlook to ${recipientEmail}`,
          });
        } catch (err) {
          console.error("Outlook send error:", err);
          await client.chat.postMessage({
            channel: userId,
            text: "❌ Failed to send email via Outlook.",
          });
        }
      }
    } catch (err) {
      console.error("Modal submission error:", err);
    }
  });
}

export { registerCommands, registerViews };
