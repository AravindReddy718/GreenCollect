// Sends emails over SMTP (any provider: Gmail app password, Brevo, SendGrid, Mailtrap...).
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in backend/.env.
//
// Without SMTP settings:
//   - development: the email (with its link) is printed in the backend console, so the
//     password-reset flow can be tested locally without an email account;
//   - production (NODE_ENV=production): nothing is printed and an error is logged.
const nodemailer = require('nodemailer');

const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return transporter;
};

// The test suite reads sent messages from here instead of a real inbox
const outbox = [];

async function sendMail({ to, subject, text, html }) {
  if (process.env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text, html });
    return;
  }
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`Email to ${to} not sent: SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS).`);
      return;
    }
    console.log(`\n[dev email] SMTP not configured, so here is the email instead:\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });
}

module.exports = { sendMail, outbox };
