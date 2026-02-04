import pkg from "@slack/bolt";
const { App, ExpressReceiver } = pkg;
import { registerCommands } from "./commands.js";

function initSlack(expressApp) {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
  });

  registerCommands(slackApp);

  // Mount Slack events on the shared Express instance
  expressApp.use("/slack/events", receiver.app);

  console.log("⚡ Slack initialized");
}

export { initSlack };
