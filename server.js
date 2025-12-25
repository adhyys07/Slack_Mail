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

// Mount Bolt receiver explicitly at /slack/events
app.use("/slack/events", slackReceiver.router);

// Body parser for your routes
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