// Validation for the claim profile fields collected on the Settings page.
// These fields end up on the claim filing (the Skånetrafiken reklamation PDF, or
// the SL web form), so bad data here can get a claim rejected. Each validator
// returns an error string, or null if ok.

export const PAYOUT_METHODS = ["bank", "sms", "email"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const isPayoutMethod = (value: unknown): value is PayoutMethod =>
  typeof value === "string" && (PAYOUT_METHODS as readonly string[]).includes(value);

// Which payout methods an operator actually offers. SL refunds Resegaranti only to a
// BANK account — it has no Värdekod-via-SMS/e-post option like Skånetrafiken — so an SL
// ticket must use the bank method (which is also what SL's autofill needs). Everyone else
// keeps all three. Keyed on the user's purchasing_operator.
export const payoutMethodsFor = (operator: string | null | undefined): readonly PayoutMethod[] =>
  operator === "sl" ? (["bank"] as const) : PAYOUT_METHODS;

// Which operator/vendor the user bought their ticket from. This is a GUARDRAIL:
// only operators flagged `supported` are filed IN-APP (Skånetrafiken = PDF reklamation).
// An operator can instead carry `externalClaimUrl`: we don't file for it — the "ansök"
// CTA just links out to the operator's own form (SL → its Resegaranti web form), and no
// claims row is ever stored. The rest are valid to SAVE but have no path yet (SJ becomes
// in-app once submit_sj lands; Snälltåget/other inert). Keys per-operator rules (§9 v3).
export const PURCHASING_OPERATORS = [
  // Skånetrafiken: the in-app PDF reklamation flow (claim-worker) is ON ICE. For now we
  // redirect to Skånetrafiken's own claim website like the other external operators — no
  // claims row is stored, no PDF data is collected.
  { value: "skanetrafiken", label: "Skånetrafiken (JoJo, app, biljettautomat)", supported: false, externalClaimUrl: "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/" },
  // Öresundståg is NOT a single authority: the claim goes to the länstrafikbolag of the
  // county where the journey STARTED (origin-routed at claim time — see REGION_AUTHORITIES
  // + v_station_claim_authority). `supported: false` since the in-app Skånetrafiken PDF flow
  // is ON ICE (2026-07-01) — every Öresundståg origin now links OUT to the right bolag's form
  // (Skåne/Köpenhamn → Skånetrafiken's site), so nothing routes to the PDF worker. The board
  // handles Öresundståg via origin routing independently of this flag; false just keeps the
  // bulk paths (MyDelays/ClaimReview) from creating a PDF claim.
  { value: "oresundstag", label: "Öresundståg", supported: false },
  { value: "sl", label: "SL (Stockholm)", supported: false, externalClaimUrl: "https://sl.se/kundservice/forseningsersattning/resan" },
  // Hallandstrafiken: EXTERNAL for now. The headless worker (submit_hallandstrafiken) is built
  // but its form geo-blocks our US/datacenter worker IP — moving the worker to an EU host is
  // backlogged, so the CTA links out to the form (reached fine from the user's own Swedish IP).
  { value: "hallandstrafiken", label: "Hallandstrafiken", supported: false, externalClaimUrl: "https://hallandstrafiken.se/kundservice/vanliga-arenden/forseningsersattning-och-reklamation/reklamation" },
  // Kalmar länstrafik — same respons web form as Hallandstrafiken, filed headlessly.
  { value: "kalmar", label: "Kalmar länstrafik", supported: true },
  // Västtrafik (Göteborg) files on its own form with BankID at the end → iOS Shortcut
  // autofill (handled by the DaylightApp branch, not the in-app flag).
  { value: "vasttrafik", label: "Västtrafik (Göteborg)", supported: false },
  // Vy (Vy Tåg) files on its own Azure reimbursement portal (no BankID) → filed HEADLESSLY
  // by the claim-worker (submit_vy.py), same review→authorize gate as Kalmar/SJ.
  { value: "vy", label: "Vy (Vy Tåg)", supported: true },
  // Regional länstrafik operators — EXTERNAL redirect for now: the claim CTA links out to each
  // operator's own förseningsersättning form (ShortcutClaimModal with no fill script, like
  // Hallandstrafiken), no claims row is stored. Headless filing is a follow-up, reconned per form.
  // UL has NO journey label (its trains run as Mälardalstrafik AB / X-trafik) → manual-select only.
  { value: "varmlandstrafik", label: "Värmlandstrafik (Värmland)", supported: false, externalClaimUrl: "https://www.varmlandstrafik.se/varmlandstrafik/kundservice/forseningsersattning" },
  { value: "ostgotatrafiken", label: "Östgötatrafiken (Östergötland)", supported: false, externalClaimUrl: "https://www.ostgotatrafiken.se/kundservice/vanliga-arenden/forseningsersattning/" },
  { value: "jlt", label: "Jönköpings Länstrafik (JLT)", supported: false, externalClaimUrl: "https://www.jlt.se/kundservice/forseningsersattning/" },
  { value: "ul", label: "UL (Uppsala län)", supported: false, externalClaimUrl: "https://www.ul.se/kundservice/forseningsersattning/formular-forseningsersattning/" },
  { value: "malartag", label: "Mälartåg (Mälardalen)", supported: false, externalClaimUrl: "https://www.malardalstrafik.se/kundservice/ansoek-om-ersaettning-vid-foersening/" },
  // Tåg i Bergslagen — surfaced by the Närke+Västmanland station fill (2026-07-01). Own
  // resegaranti; EXTERNAL link-out to its application form (the evf.* form subdomain).
  { value: "tagibergslagen", label: "Tåg i Bergslagen", supported: false, externalClaimUrl: "https://evf.tagibergslagen.regionvastmanland.se" },
  // Länstrafiken Kronoberg + Blekingetrafiken — previously reachable ONLY via Öresundståg
  // origin-routing (REGION_AUTHORITIES); now directly selectable for a Kronoberg/Blekinge
  // ticket. EXTERNAL link-out (Blekinge = its respons application form).
  { value: "kronoberg", label: "Länstrafiken Kronoberg", supported: false, externalClaimUrl: "https://lanstrafikenkron.se/ansok-om-forseningsersattning" },
  { value: "blekingetrafiken", label: "Blekingetrafiken", supported: false, externalClaimUrl: "https://respons.blekingetrafiken.se/internet/bltresegarantiv2.aspx" },
  // Snälltåget — no longer inert: EXTERNAL link-out to its "Min resa" claim page.
  { value: "snalltaget", label: "Snälltåget", supported: false, externalClaimUrl: "https://www.snalltaget.se/min-resa" },
  // Tågab (Tågåkeriet i Bergslagen) — no online form; claims go by e-mail. The link-out is a
  // mailto: the CTA opens the user's mail client pre-addressed to installt@tagakeriet.se.
  { value: "tagab", label: "Tågab", supported: false, externalClaimUrl: "mailto:installt@tagakeriet.se" },
  // Arlanda Express (TV operator "A-train") — the Arlanda N/S platforms (Arnn/Arns) are polled
  // but this is a premium airport shuttle with its OWN reklamation scheme (not Lag 2015:953 /
  // resegaranti), so it's EXTERNAL: the CTA links out to its form, no claims row is stored.
  { value: "arlandaexpress", label: "Arlanda Express", supported: false, externalClaimUrl: "https://www.arlandaexpress.se/hjalp-och-support/reklamation" },
  { value: "sj", label: "SJ", supported: false },
] as const;

// REGIONAL claim authorities for Öresundståg routing. A regional claim goes to the
// länstrafikbolag of the ORIGIN county (Lag 2015:953, 20-min regime everywhere — only the
// FORM differs). v_station_claim_authority maps origin_stop_id -> one of these keys; the UI
// then files in-app (Skånetrafiken) or links out to the bolag's own form. Skåne + all Danish
// stops resolve to skanetrafiken (Öresundståg's "även för resor från Köpenhamn" rule).
export type RegionAuthorityKey =
  | "skanetrafiken" | "hallandstrafiken" | "blekingetrafiken" | "kalmar" | "kronoberg" | "vasttrafik";
export const REGION_AUTHORITIES: Record<RegionAuthorityKey, {
  label: string; county: string; externalClaimUrl: string | null; inApp: boolean;
}> = {
  skanetrafiken:    { label: "Skånetrafiken",          county: "Skåne (och Köpenhamn)", externalClaimUrl: "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/", inApp: false },
  hallandstrafiken: { label: "Hallandstrafiken",       county: "Halland",          externalClaimUrl: "https://hallandstrafiken.se/reklamation-och-forseningsersattning", inApp: false },
  blekingetrafiken: { label: "Blekingetrafiken",       county: "Blekinge",         externalClaimUrl: "https://respons.blekingetrafiken.se/internet/bltresegarantiv2.aspx", inApp: false },
  kalmar:           { label: "Kalmar länstrafik",      county: "Kalmar län",       externalClaimUrl: "https://kalmarlanstrafik.se/Kundservice/ansok-om-forseningsersattning/", inApp: false },
  kronoberg:        { label: "Länstrafiken Kronoberg", county: "Kronoberg",        externalClaimUrl: "https://lanstrafikenkron.se/ansok-om-forseningsersattning", inApp: false },
  vasttrafik:       { label: "Västtrafik",             county: "Västra Götaland",  externalClaimUrl: "https://www.vasttrafik.se/kundservice/forseningsersattning/ansok-om-ersattning-oresundstagbiljett/", inApp: false },
};
export const isRegionAuthorityKey = (v: unknown): v is RegionAuthorityKey =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(REGION_AUTHORITIES, v);
export const regionAuthority = (v: string | null | undefined) =>
  (v && isRegionAuthorityKey(v)) ? REGION_AUTHORITIES[v] : null;
export type PurchasingOperator = (typeof PURCHASING_OPERATORS)[number]["value"];
/** Operators whose claims the app files IN-APP, derived from the `supported` flag. */
export const SUPPORTED_PURCHASING_OPERATORS: readonly PurchasingOperator[] =
  PURCHASING_OPERATORS.filter((o) => o.supported).map((o) => o.value);
export const isPurchasingOperator = (value: unknown): value is PurchasingOperator =>
  typeof value === "string" && PURCHASING_OPERATORS.some((o) => o.value === value);
/** True for any operator whose claims the app currently files IN-APP. */
export const isSupportedPurchasingOperator = (value: unknown): boolean =>
  PURCHASING_OPERATORS.some((o) => o.value === value && o.supported);
/** External operator form URL (e.g. SL), or null. When set, the claim CTA links out to
 *  the operator's own form instead of filing in-app — no claims row is stored. */
export const purchasingOperatorClaimUrl = (value: string | null | undefined): string | null =>
  (PURCHASING_OPERATORS.find((o) => o.value === value) as { externalClaimUrl?: string } | undefined)
    ?.externalClaimUrl ?? null;
export const purchasingOperatorLabel = (value: string | null | undefined): string =>
  PURCHASING_OPERATORS.find((o) => o.value === value)?.label ?? (value ?? "");

// "Match by means of transport": identify the responsible operator/authority FROM THE JOURNEY
// so the board can auto-route the claim CTA without the user picking from a list (§1). The
// Trafikverket feed carries two signals, exposed on the journey as `operator` (TV
// information_owner — the recognizable BRAND) and `train_owner` (TV's terse operator CODE).
// We resolve on information_owner first, then fall back to train_owner — because a large share
// of events (notably MOST SJ trains) have a null information_owner but a populated train_owner.
//
// `oresundstag` is a valid target here: it means "no own claim route" — the board then
// origin-routes it to a länstrafikbolag via v_station_claim_authority. An UNMAPPED signal
// returns null -> the UI falls back to the manual operator picker (safe default). Deliberately
// left unmapped because they'd mis-route or have no path: "X-Trafik"/"VR"/"MTRX" (MTR Express)
// have no purchasing_operator; train_owner "ARRIVA" is ambiguous (runs both Pågatåg→Skånetrafiken
// AND Öresundståg→origin-routed), so an ARRIVA-only row must be picked by hand.

// information_owner (BRAND) -> purchasing_operator. Exact TV strings.
const OWNER_TO_OPERATOR: Record<string, PurchasingOperator> = {
  "SL": "sl",
  "Skånetrafiken": "skanetrafiken",
  "Västtrafik": "vasttrafik",
  "Öresundståg": "oresundstag",
  "SJ": "sj",
  "VY": "vy",
  "Kalmar Länstrafik": "kalmar",
  "Hallandstrafiken": "hallandstrafiken",
  "Mälardalstrafik AB": "malartag",
  "ÖstgötaTrafiken": "ostgotatrafiken",
  "Jönköpings Länstrafik": "jlt",
  "Värmlandstrafik": "varmlandstrafik",
  "Tåg i Bergslagen": "tagibergslagen",
  "Länstrafiken Kronoberg": "kronoberg",
  "Blekingetrafiken": "blekingetrafiken",
  "A-train": "arlandaexpress",
  "Snälltåget": "snalltaget",
  "Tågab": "tagab",
};

// train_owner (CODE) -> purchasing_operator. Secondary signal for null-information_owner rows.
const TRAIN_OWNER_TO_OPERATOR: Record<string, PurchasingOperator> = {
  "SJ": "sj",
  "Ö-TÅG": "oresundstag",
  "ATRAIN": "arlandaexpress",
  "MÄLAB": "malartag",
  "SKANE": "skanetrafiken",
  "VASTTRAF": "vasttrafik",
  "SNÄLL": "snalltaget",
  "VY": "vy",
  "TÅGAB": "tagab",
  "JLT": "jlt",
  "TIB": "tagibergslagen",
  "SLL": "sl",
};

export const purchasingOperatorFromOwner = (owner: string | null | undefined): PurchasingOperator | null =>
  (owner && OWNER_TO_OPERATOR[owner.trim()]) || null;

/**
 * Auto-detect the operator/authority to file a journey's claim through, from the feed
 * signals on the journey (information_owner first, then train_owner). Returns a
 * PurchasingOperator (possibly `oresundstag`, which the caller then origin-routes) or
 * null when the signal is unknown/ambiguous — in which case the UI shows the manual picker.
 */
export const resolveOperatorFromJourney = (
  journey: { operator?: string | null; train_owner?: string | null },
): PurchasingOperator | null =>
  (journey.operator && OWNER_TO_OPERATOR[journey.operator.trim()]) ||
  (journey.train_owner && TRAIN_OWNER_TO_OPERATOR[journey.train_owner.trim()]) ||
  null;

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
  purchasingOperator: string;
  // Only validated when payoutMethod === 'bank'.
  clearingNumber?: string;
  accountNumber?: string;
};

export type ClaimProfileErrors = Partial<Record<keyof ClaimProfileInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "E-post krävs för ansökan.";
  if (!EMAIL_RE.test(value)) return "Ange en giltig e-postadress, t.ex. namn@exempel.se.";
  return null;
};

// International-friendly. We accept an optional leading +, then digits, and
// allow spaces, dashes, parentheses and dots as separators (stripped here).
// E.164 caps the national+country number at 15 digits; 7 is a sane floor.
export const validateMobile = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Mobilnummer krävs för ansökan.";
  const hasPlus = value.startsWith("+");
  const digits = value.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) {
    return "Mobilnumret får bara innehålla siffror, mellanslag, +, -, ( ) och punkter.";
  }
  if (digits.length < 7 || digits.length > 15) {
    return "Mobilnumret måste vara 7–15 siffror. Ange landskod (t.ex. +46 70 123 45 67) om du är utanför Sverige.";
  }
  // A local Swedish number (no +) should look like 07XXXXXXXX.
  if (!hasPlus && digits.startsWith("0") && !/^0\d{8,9}$/.test(digits)) {
    return "Svenska mobilnummer ser ut som 0701234567. För andra länder, lägg till + och landskod.";
  }
  return null;
};

// Swedish personnummer. Accepts 10-digit (YYMMDD-NNNN) or 12-digit
// (YYYYMMDD-NNNN), with '-' or '+' separator, or no separator at all.
// Validates the calendar date and the Luhn control digit.
export const validatePersonnummer = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "Personnummer krävs för ansökan.";

  const cleaned = value.replace(/[\s]/g, "");
  const match = cleaned.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})([-+]?)(\d{4})$/);
  if (!match) {
    return "Personnummer måste vara 10 eller 12 siffror, t.ex. 19700901-3975.";
  }

  const [, century, yy, mm, dd, , last4] = match;

  const month = Number.parseInt(mm, 10);
  const day = Number.parseInt(dd, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "Personnumret innehåller ett ogiltigt födelsedatum.";
  }

  // Luhn runs over the 10-digit form: YYMMDD + first 3 of the last 4,
  // with the 4th being the control digit.
  const tenDigits = `${yy}${mm}${dd}${last4}`;
  if (!passesLuhn(tenDigits)) {
    return "Personnumrets kontrollsiffra stämmer inte — dubbelkolla numret.";
  }

  // If a century was supplied, sanity-check it's plausible.
  if (century) {
    const fullYear = Number.parseInt(`${century}${yy}`, 10);
    const thisYear = new Date().getFullYear();
    if (fullYear < 1900 || fullYear > thisYear) {
      return "Personnumrets födelseår verkar ligga utanför giltigt intervall.";
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
  if (!value) return "Postnummer krävs för ansökan.";
  const digits = value.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) {
    return "Svenskt postnummer måste vara 5 siffror, t.ex. 211 20.";
  }
  return null;
};

export const validateRequiredText = (raw: string, label: string): string | null => {
  if (!raw.trim()) return `${label} krävs för ansökan.`;
  return null;
};

// Swedish bank clearing number: 4 digits, except Swedbank/Sparbanken which use a
// 5th digit (often written 8327-9). Account number length varies a lot by bank
// (7–11 digits in practice), so we keep the floor/ceiling loose and only catch
// obvious junk — the operator's form does the authoritative bank validation.
export const validateClearingNumber = (raw: string): string | null => {
  const digits = raw.trim().replace(/[\s-]/g, "");
  if (!digits) return "Clearingnummer krävs för utbetalning till bank.";
  if (!/^\d{4,5}$/.test(digits)) {
    return "Clearingnummer är 4 siffror (5 för Swedbank/Sparbanken), t.ex. 8327-9.";
  }
  return null;
};

export const validateAccountNumber = (raw: string): string | null => {
  const digits = raw.trim().replace(/[\s-]/g, "");
  if (!digits) return "Kontonummer krävs för utbetalning till bank.";
  if (!/^\d{7,11}$/.test(digits)) {
    return "Kontonummer ser ut att vara fel — ange 7–11 siffror (utan clearingnummer).";
  }
  return null;
};

export const validateClaimProfile = (
  input: ClaimProfileInput,
  opts: { skipTicket?: boolean } = {}
): ClaimProfileErrors => {
  const errors: ClaimProfileErrors = {};

  const firstName = validateRequiredText(input.firstName, "Förnamn");
  if (firstName) errors.firstName = firstName;

  const lastName = validateRequiredText(input.lastName, "Efternamn");
  if (lastName) errors.lastName = lastName;

  const email = validateEmail(input.claimEmail);
  if (email) errors.claimEmail = email;

  const mobile = validateMobile(input.claimMobile);
  if (mobile) errors.claimMobile = mobile;

  const pnr = validatePersonnummer(input.claimPersonnummer);
  if (pnr) errors.claimPersonnummer = pnr;

  const street = validateRequiredText(input.streetAddress, "Gatuadress");
  if (street) errors.streetAddress = street;

  const postal = validatePostalCode(input.postalCode);
  if (postal) errors.postalCode = postal;

  const city = validateRequiredText(input.city, "Ort");
  if (city) errors.city = city;

  // Ticket-ID, payout method and purchasing operator are no longer collected on the
  // Settings page — they're gathered in the claim pop-up at filing time. Settings passes
  // { skipTicket: true } so saving a personal profile doesn't require them.
  if (opts.skipTicket) return errors;

  const ticket = validateRequiredText(input.claimTicketId, "Biljett-ID");
  if (ticket) errors.claimTicketId = ticket;

  if (!input.payoutMethod) {
    errors.payoutMethod = "Välj hur du vill få din ersättning.";
  } else if (!isPayoutMethod(input.payoutMethod)) {
    errors.payoutMethod = "Utbetalningssätt måste vara Bank, SMS eller E-post.";
  } else if (!payoutMethodsFor(input.purchasingOperator).includes(input.payoutMethod)) {
    // SL only pays to a bank account — guard against a stale SMS/e-post choice.
    errors.payoutMethod = "SL betalar bara ut till bankkonto. Välj banköverföring.";
  }
  if (input.payoutMethod === "bank") {
    // Bank payout needs an account (e.g. SL's /utbetalning step). Only required
    // for the bank method — SMS/e-post Värdekod don't use a bank account.
    const clearing = validateClearingNumber(input.clearingNumber ?? "");
    if (clearing) errors.clearingNumber = clearing;
    const account = validateAccountNumber(input.accountNumber ?? "");
    if (account) errors.accountNumber = account;
  }

  // Required to SAVE: the user must declare a vendor. Whether that vendor is
  // *claimable* is enforced separately at filing time (only `supported` ones), so
  // an SJ/Snälltåget selection still saves fine — it just can't file.
  if (!input.purchasingOperator) {
    errors.purchasingOperator = "Välj var du köpte din biljett.";
  } else if (!isPurchasingOperator(input.purchasingOperator)) {
    errors.purchasingOperator = "Välj en av de listade biljettåterförsäljarna.";
  }

  return errors;
};
