const express = require("express");
const dotenv = require("dotenv");
const { initSlack } = require("./slack/app");
const { initGoogleOAuth } = require("./oauth/google.js");

dotenv.config();

const app = express();

initSlack(app);
initGoogleOAuth(app);

app.get("/", (_, res) => {
  res.send("✅ Server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
