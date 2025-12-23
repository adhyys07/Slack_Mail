import "dotenv/config";
import pkg from "@slack/bolt";
const { App, ExpressReceiver } = pkg;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

export const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

export const slackReceiver = receiver
import {registerCommands} from "./commands.js";
import { registerActions } from "./actions.js";

registerCommands(slackApp);
registerActions(slackApp);

slackApp.error((err) => {
  console.error("[bolt error]", err);
});
