# Slack Mail
**Slack Mail** is a slack bot which helps the user to access their email, not only accessing but also do most of the tasks like a normal inbox without leaving Slack
--
## Process & Commands !
1) Go to Slack and search for Slack Mail or directly access it by clicking <a href="https://hackclub.enterprise.slack.com/archives/D0ADVA6UDEC" target="_blank">Slack Mail.</a>
2) Over there you need to login first using /connect-email
3) Click your provider, for now its only Google & Microsoft.Once you authorize the access you will be able to use the full potential of the bot

<u>**Commands**</u>
* **/connect-email**: Connect Gmail, Outlook, or a custom-domain IMAP/SMTP inbox.
* **/check-accounts**: Show connection status.
* **/get-emails**: List inbox emails.
	- Usage: `/get-emails gmail [pageSize] [nextToken] [upload]`, `/get-emails outlook [pageSize] [skiptoken] [upload]`, or `/get-emails custom [pageSize]`
	- Defaults to 5; max 50. Include `upload` to also upload attachments to Slack.
* **/open-email**: View full content of a specific email.
	- Usage: `/open-email gmail 1`, `/open-email outlook 2`, or `/open-email custom 1` (indexes from the latest fetch)
* **/reply-email**: Reply to a listed email.
	- Usage: `/reply-email gmail 1 Thanks for the update cc:teammate@example.com bcc:hidden@example.com` (indexes 1–5 from latest fetch)
* **/search-email**: Search inbox and get quick open links.
	- Usage: `/search-email gmail invoice`, `/search-email outlook project`, or `/search-email custom invoice`
* **/send-email**: Opens modal to send email (supports send now, save as draft, send later, CC, BCC, and attachments).
* **/star-email**: Star/flag an email.
	- Usage: `/star-email gmail MESSAGE_ID`, `/star-email outlook MESSAGE_ID`, or `/star-email custom UID`
* **/unstar-email**: Remove star/flag from an email.
	- Usage: `/unstar-email gmail MESSAGE_ID`, `/unstar-email outlook MESSAGE_ID`, or `/unstar-email custom UID`
* **/archive-email**: Archive an email.
	- Usage: `/archive-email gmail MESSAGE_ID`, `/archive-email outlook MESSAGE_ID`, or `/archive-email custom UID`
* **/delete-email**: Move an email to trash/deleted items.
	- Usage: `/delete-email gmail MESSAGE_ID`, `/delete-email outlook MESSAGE_ID`, or `/delete-email custom UID`
* **/move-email**: Move an email to a Gmail label, Outlook folder, or custom IMAP folder.
	- Usage: `/move-email gmail MESSAGE_ID Label Name`, `/move-email outlook MESSAGE_ID Folder Name`, or `/move-email custom UID Folder Name`
* **/starred-emails**: List starred/flagged emails.
	- Usage: `/starred-emails gmail [limit]`, `/starred-emails outlook [limit]`, or `/starred-emails custom [limit]`
* **/archived-emails**: List archived emails.
	- Usage: `/archived-emails gmail [limit]`, `/archived-emails outlook [limit]`, or `/archived-emails custom [limit]`
* **/sent-emails**: List sent emails.
	- Usage: `/sent-emails gmail [limit]`, `/sent-emails outlook [limit]`, or `/sent-emails custom [limit]`
* **/unread-count**: Show inbox unread count.
	- Usage: `/unread-count gmail`, `/unread-count outlook`, or `/unread-count custom`
* **/disconnect-email**: Disconnect one provider from your Slack account.
	- Usage: `/disconnect-email gmail`, `/disconnect-email outlook`, or `/disconnect-email custom`
* **/clear-bot**: Clears bot messages in the channel.


## Features !
1) You can connect Google, Microsoft, or a custom-domain IMAP/SMTP account.
2) You can access the last 5 emails from your primary inbox.
3) Attachments are supported in emails, so if there are any you can access it.
4) You can send emails from slack itself with drafts, CC, BCC, attachments, and scheduling !
5) You can switch between inboxes efficiently.

**Custom domain inboxes**
- Use `/connect-email` and choose **Custom Domain**.
- Enter your email address and choose your email host.
- Enter the password/app password in the next modal.
- Supported presets: Zoho Mail, Google Workspace, Microsoft 365, Namecheap Private Email, and cPanel/Webmail.


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
- Axios (HTTP), IMAP client, Nodemailer (custom SMTP)
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
	- /connect-email, /get-emails, /open-email, /reply-email, /send-email, /search-email, /star-email, /unstar-email, /archive-email, /delete-email, /move-email, /starred-emails, /archived-emails, /sent-emails, /unread-count, /disconnect-email, /clear-bot
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
