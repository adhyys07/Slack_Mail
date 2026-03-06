# Slack Mail
**Slack Mail** is a slack bot which helps the user to access their email, not only accessing but also do most of the tasks like a normal inbox without leaving Slack
--
## Process & Commands !
1) Go to Slack and search for Slack Mail or directly access it by clicking <a href="https://hackclub.enterprise.slack.com/archives/D0ADVA6UDEC" target="_blank">Slack Mail.</a>
2) Over there you need to login first using /connect-email
3) Click your provider, for now its only Google & Microsoft.Once you authorize the access you will be able to use the full potential of the bot

<u>**Commands**</u>
* **/connect-email**: Connect Gmail or Outlook.
* **/check-accounts**: Show connection status.
* **/get-emails**: List inbox emails.
	- Usage: `/get-emails gmail [pageSize] [nextToken] [upload]` or `/get-emails outlook [pageSize] [skiptoken] [upload]`
	- Defaults to 5; max 50. Include `upload` to also upload attachments to Slack.
* **/open-email**: View full content of a specific email.
	- Usage: `/open-email gmail 1` or `/open-email outlook 2` (indexes from the latest fetch)
* **/reply-email**: Reply to a listed email.
	- Usage: `/reply-email gmail 1 Thanks for the update` (indexes 1–5 from latest fetch)
* **/search-email**: Search inbox and get quick open links.
	- Usage: `/search-email gmail invoice` or `/search-email outlook project`
* **/send-email**: Opens modal to send email (supports attachments, schedule).
* **/clear-bot**: Clears bot messages in the channel.


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

## Slack Bot Setup (Quick Guide)
1) Create a Slack App: https://api.slack.com/apps → "Create New App" → From scratch.
2) Basic info: Add name/icon and choose your workspace.
3) OAuth & Permissions:
	- Scopes (Bot Token): `commands`, `chat:write`, `files:write`, `im:history` (if needed), plus any others your flows require.
	- Install to Workspace → copy `SLACK_BOT_TOKEN`.
4) App Credentials: copy `SLACK_SIGNING_SECRET`.
5) Slash Commands:
	- /connect-email, /get-emails, /open-email, /reply-email, /send-email, /search-email, /clear-bot
	- For each command set the Request URL to: `https://your-server.com/slack/events`
6) Event Subscriptions:
	- Enable events; Request URL: `https://your-server.com/slack/events`
	- Subscribe to bot events if needed (e.g., `app_home_opened` if you add a home tab).
7) Interactivity & Shortcuts:
	- Enable and set Request URL: `https://your-server.com/slack/events`
8) Environment:
	- Set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in your hosting environment.
9) Deploy:
	- Ensure your server (Express + Bolt) listens on `/slack/events` and that your public BASE_URL matches the URLs above.
10) Reinstall after scope or command changes.

## For Transparency
I have used AI for bug fixing and code suggestions, also at some place to modify some features for this bot !