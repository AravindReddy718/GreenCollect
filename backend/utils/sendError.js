// Sends a consistent JSON error. Client mistakes (bad fields, bad IDs, duplicates) become 4xx
// with a readable message; anything else is logged on the server and returned as a generic 500.

const friendlyMessage = (e) => {
  if (/^Path `.+` is required\.$/.test(e.message)) return `${e.path} is required`;
  if (e.kind === 'enum') return `${e.path} has an invalid value`;
  if (e.name === 'CastError') return `${e.path} has an invalid value`;
  return e.message;
};

const validationMessage = (err) =>
  err && err.name === 'ValidationError'
    ? Object.values(err.errors).map(friendlyMessage).join(', ')
    : null;

const sendError = (res, err, fallback = 'Server error', key = 'message') => {
  const invalid = validationMessage(err);
  if (invalid) return res.status(400).json({ success: false, [key]: invalid });
  if (err && err.name === 'CastError') {
    return res.status(400).json({ success: false, [key]: `Invalid ${err.path === '_id' ? 'ID' : err.path}` });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ success: false, [key]: 'That record already exists' });
  }
  console.error(fallback, err);
  return res.status(500).json({ success: false, [key]: fallback });
};

module.exports = { sendError, validationMessage };
