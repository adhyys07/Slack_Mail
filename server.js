import express from "express";
import { slackApp } from "./slack/app.js";
import { googleOAuthRouter } from "./oauth/google.js";

const app = express();

// 🚨 Bolt MUST be first
app.use("/slack/events", slackApp.receiver.app);

// OAuth routes AFTER Bolt
app.use("/oauth/google", googleOAuthRouter);

// Other routes
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
