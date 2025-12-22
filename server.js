
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { googleOAuthRouter } from "./oauth/google.js";
import { microsoftOAuthRouter } from "./oauth/microsoft.js";
import { slackReceiver } from "./slack/app.js"

const app = express();

app.use((req, res, next) => {
  console.log("INCOMING:", req.method, req.path)
  next()
})

app.use(express.json());
app.use("https://slack-mail.onrender.com/slack/events", slackReceiver.app)
app.use("https://slack-mail.onrender.com/oauth/google",googleOAuthRouter)
app.use("https://slack-mail.onrender.com/oauth/microsoft",microsoftOAuthRouter)

app.listen(3000,() => {
    console.log("Server is running on port 3000");
})

