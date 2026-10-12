'use strict';
// Sends emails. Never throws: a failed email must not break an order or a payment.
const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporter;
}

async function sendMail(to, subject, text) {
  try {
    const t = getTransporter();
    if (!t || !to) {
      console.warn('Email skipped: set SMTP_USER, SMTP_PASS (and ALERT_EMAIL_TO) in .env');
      return false;
    }
    await t.sendMail({ from: `"Oracle's Data Hub" <${process.env.SMTP_USER}>`, to, subject, text });
    return true;
  } catch (err) {
    console.error('Email failed:', err.message);
    return false;
  }
}

module.exports = { sendMail };
