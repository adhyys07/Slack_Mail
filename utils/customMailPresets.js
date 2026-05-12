export const CUSTOM_MAIL_PRESETS = {
  zoho: {
    label: "Zoho Mail",
    imapHost: "imap.zoho.com",
    imapPort: 993,
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
  },
  google_workspace: {
    label: "Google Workspace",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
  },
  microsoft_365: {
    label: "Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  namecheap: {
    label: "Namecheap Private Email",
    imapHost: "mail.privateemail.com",
    imapPort: 993,
    smtpHost: "mail.privateemail.com",
    smtpPort: 465,
  },
  cpanel: {
    label: "cPanel / Webmail",
    imapHostForEmail(email) {
      return `mail.${email.split("@")[1]}`;
    },
    imapPort: 993,
    smtpHostForEmail(email) {
      return `mail.${email.split("@")[1]}`;
    },
    smtpPort: 465,
  },
};

export function getCustomMailPreset(provider, email) {
  const preset = CUSTOM_MAIL_PRESETS[provider];
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!preset || !normalizedEmail.includes("@")) return null;

  return {
    provider,
    label: preset.label,
    email: normalizedEmail,
    username: normalizedEmail,
    imapHost: preset.imapHostForEmail
      ? preset.imapHostForEmail(normalizedEmail)
      : preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHostForEmail
      ? preset.smtpHostForEmail(normalizedEmail)
      : preset.smtpHost,
    smtpPort: preset.smtpPort,
  };
}
