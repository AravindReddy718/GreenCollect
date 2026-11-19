// Mirrors backend/utils/validation.js so forms reject bad input before it is sent.
// The server checks everything again; keep the two files in step.

// Email: letters, digits and . _ % + - before the @ (starting and ending with a letter or digit, no ".."),
// then domain labels and a 2-24 letter ending such as .com or .co.in
const EMAIL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

export const isValidEmail = (value: string): boolean => {
  const email = value.trim();
  return email.length <= 254 && !email.includes('..') && EMAIL_RE.test(email);
};

// Phone: Indian mobile number (10 digits starting 6-9), optionally written with +91, 91 or 0
// and with spaces or hyphens. Returns the bare 10-digit number, or null if invalid.
export const normalizePhone = (value: string): string | null => {
  const compact = value.trim().replace(/[\s-]/g, '');
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? match[1] : null;
};
export const PHONE_MESSAGE = 'Enter a valid 10-digit mobile number (e.g. 9876543210)';

// Name: 2-50 characters; letters in any language, spaces, apostrophes, dots and hyphens; starts with a letter
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ');
export const isValidName = (value: string): boolean => {
  const name = normalizeName(value);
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name);
};
export const NAME_MESSAGE = "Name must be 2-50 letters (spaces, . ' and - are allowed)";

// Password: 8-72 characters with at least one letter and one number
export const passwordError = (value: string): string | null => {
  if (value.length < 8 || value.length > 72) return 'Password must be 8-72 characters';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Password must include at least one letter and one number';
  return null;
};

// Indian vehicle registration (KA01AB1234) or Bharat series (22BH1234AB).
// Spaces/hyphens are allowed; returns the compact upper-case plate, or null if invalid.
export const normalizeVehicleNumber = (value: string): string | null => {
  const plate = value.toUpperCase().replace(/[\s-]/g, '');
  const standard = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
  const bharat = /^\d{2}BH\d{4}[A-Z]{1,2}$/;
  return standard.test(plate) || bharat.test(plate) ? plate : null;
};
