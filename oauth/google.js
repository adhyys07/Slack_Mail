import express from "express"
import { google } from "googleapis"

export const googleOAuthRouter = express.Router();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT
)

googleOAuthRouter.get("/",(req,res)=>{
    const url = oauth2Client.generateAuthUrl({
        scope:[
            "https://www.googleapis.com/auth/gmail.readonly"
        ]
    })
    res.redirect(url)
})

googleOAuthRouter.get("/callback",async(req,res)=>{
    const { tokens }= await oauth2Client.getToken(req.query.code)
    console.log(tokens)
    res.send("Google E-mail connected successfully !!")
})