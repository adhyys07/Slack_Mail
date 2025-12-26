import { App, ExpressReceiver } from "@slack/bolt";
import { registerCommands } from "./commands.js";

export function initSlack(expressApp) {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
  });

  // ✅ Commands live ONLY in commands.js
  registerCommands(slackApp);

  // Mount Slack events
  expressApp.use("/slack/events", receiver.app);

  console.log("⚡ Slack initialized");
}
