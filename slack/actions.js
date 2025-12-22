import { detectProvider } from "../utils/providerDetector.js";

export function registerActions(slackApp) {
    slackApp.view("email_submit", async ({ ack, view }) => {
        await ack();
        const email = view?.state?.values?.email?.value?.value;
        if (!email) {
            console.warn("No email found in view submission state");
            return;
        }
        const provider = await detectProvider(email);
        console.log("Provider", provider);
    });
}