'use strict';
// Sends password-reset emails when SMTP is configured; otherwise returns false.
const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
let transport = null;

function getTransport() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

async function sendReset(to, link) {
  if (!configured) return false;
  await getTransport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your Vitalis password',
    text: `Use this link to choose a new password. It works for 1 hour.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
  });
  return true;
}

module.exports = { configured, sendReset };
