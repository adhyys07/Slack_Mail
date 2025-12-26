import { App } from "@slack/bolt";
import dotenv from "dotenv";

dotenv.config();

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  port: process.env.PORT || 3000,
});

(async () => {
  await app.start();
  console.log("⚡ Slack Mail Bot running");
})();
