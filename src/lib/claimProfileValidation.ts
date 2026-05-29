// Validation for the claim profile fields collected on the Settings page.
// These fields end up on the Skånetrafiken reklamation, so bad data here can
// get a claim rejected. Each validator returns an error string, or null if ok.

export const PAYOUT_METHODS = ["bank", "sms", "email"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const isPayoutMethod = (value: unknown): value is PayoutMethod =>
  typeof value === "string" && (PAYOUT_METHODS as readonly string[]).includes(value);

export type ClaimProfileInput = {
  firstName: string;
  lastName: string;
  claimEmail: string;
  claimMobile: string;
  claimPersonnummer: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  claimTicketId: string;
  payoutMethod: string;
};

export type ClaimProfileErrors = Partial<Record<keyof ClaimProfileInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Email is required for the claim.";
  if (!EMAIL_RE.test(value)) return "Enter a valid email like name@example.com.";
  return null;
};

// International-friendly. We accept an optional leading +, then digits, and
// allow spaces, dashes, parentheses and dots as separators (stripped here).
// E.164 caps the national+country number at 15 digits; 7 is a sane floor.
export const validateMobile = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Mobile number is required for the claim.";
  const hasPlus = value.startsWith("+");
  const digits = value.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) {
    return "Mobile number may only contain digits, spaces, +, -, ( ) and dots.";
  }
  if (digits.length < 7 || digits.length > 15) {
    return "Mobile number must be 7–15 digits. Include the country code (e.g. +46 70 123 45 67) if outside Sweden.";
  }
  // A local Swedish number (no +) should look like 07XXXXXXXX.
  if (!hasPlus && digits.startsWith("0") && !/^0\d{8,9}$/.test(digits)) {
    return "Swedish mobile numbers look like 0701234567. For other countries, add the + country code.";
  }
  return null;
};

// Swedish personnummer. Accepts 10-digit (YYMMDD-NNNN) or 12-digit
// (YYYYMMDD-NNNN), with '-' or '+' separator, or no separator at all.
// Validates the calendar date and the Luhn control digit.
export const validatePersonnummer = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Personnummer is required for the claim.";

  const cleaned = value.replace(/[\s]/g, "");
  const match = cleaned.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})([-+]?)(\d{4})$/);
  if (!match) {
    return "Personnummer must be 10 or 12 digits, e.g. 19700901-3975.";
  }

  const [, century, yy, mm, dd, , last4] = match;

  const month = Number.parseInt(mm, 10);
  const day = Number.parseInt(dd, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "Personnummer contains an invalid birth date.";
  }

  // Luhn runs over the 10-digit form: YYMMDD + first 3 of the last 4,
  // with the 4th being the control digit.
  const tenDigits = `${yy}${mm}${dd}${last4}`;
  if (!passesLuhn(tenDigits)) {
    return "Personnummer control digit is wrong — double-check the number.";
  }

  // If a century was supplied, sanity-check it's plausible.
  if (century) {
    const fullYear = Number.parseInt(`${century}${yy}`, 10);
    const thisYear = new Date().getFullYear();
    if (fullYear < 1900 || fullYear > thisYear) {
      return "Personnummer birth year looks out of range.";
    }
  }

  return null;
};

const passesLuhn = (digits: string): boolean => {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number.parseInt(digits[i], 10);
    // Double every second digit starting from the left (positions 0,2,4...).
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

export const validatePostalCode = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Postal code is required for the claim.";
  const digits = value.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) {
    return "Swedish postal code must be 5 digits, e.g. 211 20.";
  }
  return null;
};

export const validateRequiredText = (raw: string, label: string): string | null => {
  if (!raw.trim()) return `${label} is required for the claim.`;
  return null;
};

export const validateClaimProfile = (input: ClaimProfileInput): ClaimProfileErrors => {
  const errors: ClaimProfileErrors = {};

  const firstName = validateRequiredText(input.firstName, "First name");
  if (firstName) errors.firstName = firstName;

  const lastName = validateRequiredText(input.lastName, "Last name");
  if (lastName) errors.lastName = lastName;

  const email = validateEmail(input.claimEmail);
  if (email) errors.claimEmail = email;

  const mobile = validateMobile(input.claimMobile);
  if (mobile) errors.claimMobile = mobile;

  const pnr = validatePersonnummer(input.claimPersonnummer);
  if (pnr) errors.claimPersonnummer = pnr;

  const street = validateRequiredText(input.streetAddress, "Street address");
  if (street) errors.streetAddress = street;

  const postal = validatePostalCode(input.postalCode);
  if (postal) errors.postalCode = postal;

  const city = validateRequiredText(input.city, "City");
  if (city) errors.city = city;

  const ticket = validateRequiredText(input.claimTicketId, "Ticket ID");
  if (ticket) errors.claimTicketId = ticket;

  if (!input.payoutMethod) {
    errors.payoutMethod = "Pick how you want to receive payouts.";
  } else if (!isPayoutMethod(input.payoutMethod)) {
    errors.payoutMethod = "Payout method must be Bank, SMS or Email.";
  }

  return errors;
};
