import express from "express";
import axios from "axios";
import { saveUser } from "../db/store.js";
import { slackApp } from "../slack/app.js";

export const microsoftOAuthRouter = express.Router()

const CLIENT_ID = process.env.MS_CLIENT_ID
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET
const REDIRECT_URI = process.env.MS_REDIRECT

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

microsoftOAuthRouter.get("/", (req, res) => {
    const slackUserId = req.query.slackUserId;

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        response_mode: "query",
        scope: "offline_access Mail.Read Mail.Send",
        state: slackUserId || "",
    });
    res.redirect(`${AUTH_URL}?${params.toString()}`);
});

microsoftOAuthRouter.get("/callback", async (req, res) => {
    const { code, state: slackUserId } = req.query;

    try {
        const tokenRes = await axios.post(
            TOKEN_URL,
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        const { access_token, refresh_token, expires_in } = tokenRes.data;

        saveUser(slackUserId, {
            provider: "microsoft",
            access_token,
            refresh_token,
            expires_at: Date.now() + expires_in * 1000,
        });

        if (slackUserId) {
            const dm = await slackApp.client.conversations.open({ users: slackUserId });
            if (dm.ok) {
                await slackApp.client.chat.postMessage({
                    channel: dm.channel.id,
                    text: "Microsoft email connected successfully",
                });
            }
        }

        res.send("Microsoft Email connected successfully");
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Microsoft OAuth Failed !!");
    }
});