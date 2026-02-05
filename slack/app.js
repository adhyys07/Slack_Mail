import pkg from "@slack/bolt";
const { App, ExpressReceiver } = pkg;
import { registerCommands, registerViews } from "./commands.js";

let slackApp;

function initSlack(expressApp) {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
  });

  // Catch signature verification errors
  receiver.app.use((err, req, res, next) => {
    console.error("⚠️ Middleware error:", err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).send({ error: err.message });
  });

  registerCommands(slackApp);
  registerViews(slackApp);

  // Mount Slack receiver at root so /slack/events works
  expressApp.use(receiver.app);

  console.log("⚡ Slack initialized");
}

export { initSlack, slackApp };
