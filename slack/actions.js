import { detectProvider } from "../utils/providerDetector.js";

const oauthUrlFor = (provider) => {
  if (provider === "gmail") return `${process.env.PUBLIC_BASE_URL}/oauth/google`;
  if (["microsoft", "outlook", "office365", "hotmail", "live"].includes(provider)) {
    return `${process.env.PUBLIC_BASE_URL}/oauth/microsoft`;
  }
  return `${process.env.PUBLIC_BASE_URL}/oauth/microsoft`; // fallback
};

export function registerActions(slackApp) {
  slackApp.view("email_submit", async ({ ack, view, body, client }) => {
    console.log("[view email_submit] invoked", {
      user: body?.user?.id,
      state: view?.state,
    });
    try {
      await ack();

      const email =
        view?.state?.values?.email?.value?.value ||
        view?.state?.values?.email?.value?.trim?.();

      if (!email) {
        console.warn("[view email_submit] missing email", view?.state);
        return;
      }

      const provider = await detectProvider(email);
      const base = process.env.PUBLIC_BASE_URL;
      if (!base) {
        console.error("[view email_submit] PUBLIC_BASE_URL missing");
        return;
      }
      const oauthUrl = oauthUrlFor(provider);

      const dmResp = await client.conversations.open({ users: body.user.id });
      if (!dmResp.ok) {
        console.error("[conversations.open] failed", dmResp.error);
        return;
      }

      // Only attach button if URL is valid
      const blocks = oauthUrl
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `Connect your *${provider}* account:` },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Continue" },
                  url: oauthUrl,
                },
              ],
            },
          ]
        : undefined;

      const postResp = await client.chat.postMessage({
        channel: dmResp.channel.id,
        text: oauthUrl
          ? `Connect your ${provider} account: ${oauthUrl}`
          : `Connect your ${provider} account using the provided link.`,
        blocks,
      });

      if (!postResp.ok) {
        console.error("[chat.postMessage] failed", postResp.error);
      }

      console.log("[view email_submit] provider detected", {
        user: body?.user?.id,
        email,
        provider,
      });
    } catch (err) {
      console.error("[view email_submit] error", err);
    }
  });
}