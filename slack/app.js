const { App, ExpressReceiver } = require("@slack/bolt");
const { registerCommands } = require("./commands");

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

module.exports = { initSlack };
