// Sends emails over SMTP (any provider: Gmail app password, Brevo, SendGrid, Mailtrap...).
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in backend/.env.
//
// Without SMTP settings:
//   - development: the email (with its link) is printed in the backend console, so the
//     password-reset flow can be tested locally without an email account;
//   - production (NODE_ENV=production): nothing is printed and an error is logged.
const nodemailer = require('nodemailer');

// The example values from the README/.env.example count as "not configured"
const PLACEHOLDERS = new Set(['you@gmail.com', 'your-app-password', 'your_smtp_user', 'your_smtp_password']);
const isConfigured = () => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && !PLACEHOLDERS.has(SMTP_USER) && !PLACEHOLDERS.has(SMTP_PASS));
};

const printEmail = (to, subject, text) =>
  console.log(`To: ${to}\nSubject: ${subject}\n${text}\n`);

// A clear next step for the most common SMTP problems
const smtpHint = (err) => {
  if (err && err.code === 'EAUTH') {
    return 'The SMTP login was rejected. For Gmail, turn on 2-Step Verification and use a 16-character App Password '
      + '(your normal Gmail password will not work). Or remove the SMTP_* lines from backend/.env to print reset links in this terminal instead.';
  }
  return 'Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in backend/.env.';
};

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
    console.log('\n[dev email] SMTP is not configured (or still has the example values). Here is the email instead:');
    printEmail(to, subject, text);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
    // Development: also show the email (and its link) here. Never in production, where anyone
    // who can read the server logs could otherwise use a reset link.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[dev email] Email sent to ${to}. Copy for development:`);
      printEmail(to, subject, text);
    }
  } catch (err) {
    const reason = String(err.message || err).split('\n')[0];
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${reason} ${smtpHint(err)}`);
    }
    // Development: explain the problem and still show the email, so testing is never blocked
    console.error(`\n[dev email] Could not send email to ${to}: ${reason}\n${smtpHint(err)}\nHere is the email instead:`);
    printEmail(to, subject, text);
  }
}

// One line for the startup log, so it is obvious whether reset emails will really be sent
const describeMailConfig = () => {
  if (!isConfigured()) {
    return process.env.NODE_ENV === 'production'
      ? '📧 Email: SMTP not configured, password-reset emails will NOT be sent'
      : '📧 Email: SMTP not configured, password-reset links will be printed in this terminal';
  }
  const user = process.env.SMTP_USER;
  const masked = user.includes('@') ? `${user.slice(0, 3)}***@${user.split('@')[1]}` : `${user.slice(0, 3)}***`;
  return `📧 Email: sending via ${process.env.SMTP_HOST} as ${masked}`;
};

module.exports = { sendMail, outbox, describeMailConfig };
