app.use((req, res, next) => {
  console.log("INCOMING:", req.method, req.path)
  next()
})
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { googleOAuthRouter } from "./oauth/google.js";
import { microsoftOAuthRouter } from "./oauth/microsoft.js";
import { slackReceiver  } from './slack/app.js';

const app = express();

app.use(express.json());
app.use("/slack/events", slackReceiver.router)
app.use("/oauth/google",googleOAuthRouter)
app.use("/oauth/microsoft",microsoftOAuthRouter)

app.listen(3000,() => {
    console.log("Server is running on port 3000");
})

