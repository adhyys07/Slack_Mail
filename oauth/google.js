import express from "express";
import { google } from "googleapis";
import { slackApp } from "../slack/app.js";

export const googleOAuthRouter = express.Router();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT
)

googleOAuthRouter.get("/", (req, res) => {
    const slackUserId = req.query.slackUserId;
    const url = oauth2Client.generateAuthUrl({
        scope: ["https://www.googleapis.com/auth/gmail.readonly"],
        state: slackUserId || "",
    });
    res.redirect(url);
});

googleOAuthRouter.get("/callback", async (req, res) => {
    const slackUserId = req.query.state;
    try {
        const { tokens } = await oauth2Client.getToken(req.query.code);
        console.log(tokens);

        if (slackUserId) {
            const dm = await slackApp.client.conversations.open({ users: slackUserId });
            if (dm.ok) {
                await slackApp.client.chat.postMessage({
                    channel: dm.channel.id,
                    text: "Google email connected successfully",
                });
            }
        }

        res.send("Google E-mail connected successfully !!");
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Google OAuth Failed !!");
    }
});