// Linear-time email check (no nested repetition, so it cannot backtrack exponentially)
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

const isValidEmail = (value) => typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());

module.exports = { EMAIL_RE, isValidEmail };
