import { detectProvider } from "../utils/providerDetector.js";

const oauthUrlFor = (provider) => {
    if (provider === "gmail") return `${process.env.PUBLIC_BASE_URL}/oauth/google`;
    if (["microsoft", "outlook", "office365", "hotmail", "live"].includes(provider))
        return `${process.env.PUBLIC_BASE_URL}/oauth/microsoft`;
    return `${process.env.PUBLIC_BASE_URL}/oauth/microsoft`; // fallback
    };



export function registerActions(slackApp) {
  slackApp.view("email_submit", async ({ ack, view, body }) => {
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