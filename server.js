import express from 'express';
import dotenv from 'dotenv';
import { slackApp } from "./slack/app.js";
import { googleOAuthRouter } from "./oauth/google.js";
import { microsoftOAuthRouter } from "./oauth/microsoft.js";

dotenv.config();
const app = express();

app.use(express.json());
app.use("/slack/events", slackApp.reciever.app)
app.use("/oauth/google",googleOAuthRouter)
app.use("/oauth/microsoft",microsoftOAuthRouter)

app.listen(3000,() => {
    console.log("Server is running on port 3000");
})

