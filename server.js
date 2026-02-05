import express from "express";
import dotenv from "dotenv";
import { initSlack } from "./slack/app.js";
import { initGoogleOAuth } from "./oauth/google.js";
import { initMicrosoftOAuth } from "./oauth/microsoft.js";

dotenv.config();

const app = express();

// ⚠️ CRITICAL: Parse JSON BEFORE Slack receiver (needed for signature verification)
app.use(express.json());

initSlack(app);
initGoogleOAuth(app);
initMicrosoftOAuth(app);

app.get("/", (_, res) => {
  res.send("✅ Server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
