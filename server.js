import express from "express";
import dotenv from "dotenv";
import { initSlack } from "./slack/app.js";
import { initGoogleOAuth } from "./oauth/google.js";
import { initMicrosoftOAuth } from "./oauth/microsoft.js";
import { downloadGmailAttachment, downloadOutlookAttachment } from "./services/attachments.js";

dotenv.config();

const app = express();

// ⚠️ CRITICAL: Parse JSON BEFORE Slack receiver (needed for signature verification)
app.use(express.json());

initSlack(app);
initGoogleOAuth(app);
initMicrosoftOAuth(app);

app.get("/attachment/:provider/:messageId/:attachmentId", async (req, res) => {
  const { provider, messageId, attachmentId } = req.params;
  const userId = req.query.user;
  const downloadName = req.query.filename || "attachment.bin";
  const downloadType = req.query.type || "application/octet-stream";
  if (!userId) return res.status(401).send("Unauthorized: Missing user ID");
  try {
    if (provider === "gmail") {
      const { buffer } = await downloadGmailAttachment(userId, messageId, attachmentId);
      res.setHeader("Content-Type", downloadType);
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.send(buffer);
    } else if (provider === "outlook") {
      const { buffer } = await downloadOutlookAttachment(userId, messageId, attachmentId);
      res.setHeader("Content-Type", downloadType);
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.send(buffer);
    }
    return res.status(400).send("Invalid provider");
  } catch (err) {
    console.error("Attachment Download Error !",err);
    res.status(500).send("Failed to download attachment");
  }
});
app.get("/", (_, res) => {
  res.send("✅ Server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
