import express from "express";
import dotenv from "dotenv";
import { initSlack } from "./slack/app.js";
import { initGoogleOAuth } from "./oauth/google.js";

dotenv.config();

const app = express();

// Slack (creates App + registers commands)
initSlack(app);

// Google OAuth routes
initGoogleOAuth(app);

// Health check
app.get("/", (_, res) => {
  res.send("✅ Server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
