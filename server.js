import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { slackApp, slackReceiver } from "./slack/app.js";
import { googleOAuthRouter } from "./oauth/google.js";
import { microsoftOAuthRouter } from "./oauth/microsoft.js";

const app = express();

app.use((req, res, next) => {
  console.log("INCOMING:", req.method, req.path);
  next();
});

// Mount Slack receiver at root; it registers /slack/events internally
app.use(slackReceiver.app);

// Body parser for your OAuth routes
app.use(express.json());
app.use("/oauth/google", googleOAuthRouter);
app.use("/oauth/microsoft", microsoftOAuthRouter);

app.use((err, req, res, next) => {
  console.error("ERR:", err);
  res.status(500).send("Server error");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});