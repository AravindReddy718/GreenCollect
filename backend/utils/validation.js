// Shared input rules for every form. The frontend mirrors these in src/utils/validation.ts,
// so keep the two files in step.

// Email: the practical format real providers allow.
// Local part: letters, digits and . _ % + -, starting and ending with a letter or digit, no "..".
// Domain: labels of letters, digits and hyphens (not starting/ending with "-"), then a 2-24 letter TLD.
// Every quantifier is bounded, so matching time stays linear (no ReDoS).
const EMAIL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

const isValidEmail = (value) => {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  return email.length <= 254 && !email.includes('..') && EMAIL_RE.test(email);
};

// Phone: Indian mobile number, 10 digits starting with 6-9. May be written with +91, 91 or 0
// in front and with spaces or hyphens. Returns the bare 10-digit number, or null if invalid.
const normalizePhone = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const compact = String(value).trim().replace(/[\s-]/g, '');
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? match[1] : null;
};
const PHONE_MESSAGE = 'Enter a valid 10-digit mobile number (e.g. 9876543210)';

// Name: 2-50 characters; letters in any language, spaces, apostrophes, dots and hyphens;
// must start with a letter. Repeated spaces are collapsed.
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
const normalizeName = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const isValidName = (value) => {
  const name = normalizeName(value);
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name);
};
const NAME_MESSAGE = "Name must be 2-50 letters (spaces, . ' and - are allowed)";

// Password: 8-72 characters (bcrypt ignores anything after 72) with at least one letter and one number.
const passwordError = (value) => {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72) {
    return 'Password must be 8-72 characters';
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include at least one letter and one number';
  }
  return null;
};

// Vehicle: allowed types match the User schema enum.
const VEHICLE_TYPES = ['Three-wheeler', 'Pickup Truck', 'Mini Truck', 'Truck', 'Car', 'Van', 'Motorcycle', 'Bicycle', 'Other'];

// Indian registration number: state code + RTO number + optional series + 4 digits (KA01AB1234),
// or Bharat series (22BH1234AB). Spaces/hyphens are allowed in input. Returns the compact
// upper-case plate, or null if invalid.
const normalizeVehicleNumber = (value) => {
  if (typeof value !== 'string') return null;
  const plate = value.toUpperCase().replace(/[\s-]/g, '');
  const standard = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
  const bharat = /^\d{2}BH\d{4}[A-Z]{1,2}$/;
  return standard.test(plate) || bharat.test(plate) ? plate : null;
};

module.exports = {
  EMAIL_RE,
  isValidEmail,
  normalizePhone,
  PHONE_MESSAGE,
  normalizeName,
  isValidName,
  NAME_MESSAGE,
  passwordError,
  VEHICLE_TYPES,
  normalizeVehicleNumber
};
