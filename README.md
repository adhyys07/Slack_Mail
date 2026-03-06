# Slack Mail
**Slack Mail** is a slack bot which helps the user to access their email, not only accessing but also do most of the tasks like a normal inbox without leaving Slack
--
## Process & Commands !
1) Go to Slack and search for Slack Mail or directly access it by clicking <a href="https://hackclub.enterprise.slack.com/archives/D0ADVA6UDEC" target="_blank">Slack Mail.</a>
2) Over there you need to login first using /connect-email
3) Click your provider, for now its only Google & Microsoft.Once you authorize the access you will be able to use the full potential of the bot

<u>**Commands**</u>
* **/connect-email**: Allows the user to connect their inbox within slack.
* **/get-emails**: It will grab the user emails. It requires inbox parameters.
	- Usage: `/get-emails google` or `/get-emails outlook`
	- Returns the last 5 inbox messages and shows attachment links (click to download)
* **/open-email**: This command will allow the user to access to full content of a specific email
    - Usage: To view a specific email body, use `/open-email gmail 1` or `/open-email outlook 1` (indexes 1–5)
* **/send-email**: It will open a dialog box to select all the info required to send an email from your authorized inbox.
* **/check-accounts**: It helps us to verify if the account is logged in or not.
* **/clear-bot**: It clears all the messages in the bot to maintain privacy


## Features !
1) You can connect Google or Microsoft Account.
2) You can access the last 5 emails from your primary inbox.
3) Attachments are supported in emails, so if there are any you can access it.
4) You can send emails from slack itself with attachments !
5) You can switch between inboxes efficiently.


## For Developers!
```
git clone https://github.com/adhyys07/slack_Mail.git
cd slack_Mail
npm install

```

**Framework / Packages**
- Node.js + Express (API and routes)
- Slack Bolt (Slack commands + views)
- Google APIs (Gmail send/read/attachments)
- Microsoft Graph (Outlook send/read/attachments)
- Redis (token store)
- Axios (HTTP), IMAP client
- Heroku (For Bot Hosting)

**Environment Variables**
```
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_SIGNING_SECRET=slack_bot_signing_secret
GOOGLE_CLIENT_ID=google_client_id
GOOGLE_CLIENT_SECRET=google_client_secret
GOOGLE_REDIRECT_URI=https://server_url/auth/google/callback
MS_CLIENT_ID=microsoft_client_id
MS_CLIENT_SECRET=microsoft_client_secret
MS_REDIRECT=https://server_url/auth/microsoft/callback
REDIS_URL=your_db_url
BASE_URL=https://server_url
PORT=3000
```

## For Transparency
I have used AI for bug fixing and code suggestions, also at some place to modify some features for this bot !