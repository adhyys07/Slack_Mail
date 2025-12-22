
import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { googleOAuthRouter } from "./oauth/google.js";
import { microsoftOAuthRouter } from "./oauth/microsoft.js";
import { slackReceiver } from "./slack/app.js";

const app = express();

app.use((req, res, next) => {
  console.log("INCOMING:", req.method, req.path);
  next();
});

// Mount Slack receiver first so Bolt can verify signatures on the raw body
app.use("/slack/events", slackReceiver.router);

// Body parser for the rest of the app
app.use(express.json());
app.use("/oauth/google", googleOAuthRouter);
app.use("/oauth/microsoft", microsoftOAuthRouter);

app.use((err, req, res, next) => {
  console.error("ERR:", err);
  res.status(500).send("Server error");
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

