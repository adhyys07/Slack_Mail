import { detectProvider } from "../utils/providerDetector.js";

export function registerActions(slackApp) {
  slackApp.view("email_submit", async ({ ack, view, body }) => {
    try {
      await ack(); // respond within 3s

      const email =
        view?.state?.values?.email?.value?.value ||
        view?.state?.values?.email?.value?.trim?.();

      if (!email) {
        console.warn("[view email_submit] missing email", {
          user: body?.user?.id,
          state: view?.state,
        });
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