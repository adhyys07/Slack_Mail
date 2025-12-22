import { App } from "@slack/bolt";
import "./commands.js";
import "./actions.js";

export const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
})