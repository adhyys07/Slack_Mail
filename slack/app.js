import bolt from "@slack/bolt";
import "dotenv/config"
const { App, ExpressReceiver } = bolt;

export const slackReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

export const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: slackReceiver,
});
import {registerCommands} from "./commands.js";
import { registerActions } from "./actions.js";

registerCommands(slackApp);
registerActions(slackApp);
