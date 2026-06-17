// Deferred claim filing for the logged-out funnel when email confirmation is ON.
//
// At the create-account step, supabase.auth.signUp returns NO session until the
// user clicks the confirmation link — so we can't write the profile/signature/
// claim yet (all RLS-gated on auth.uid()). We stash everything the user typed
// (the journey, the profile fields, the signature as a data URL) in localStorage
// keyed to the new user id, and replay the writes once they return authenticated
// (usePendingClaimCompletion). The blob is cleared the moment the claim lands.
//
// Tradeoff (accepted): personnummer + the signature image sit in localStorage in
// plaintext, same-origin, until completion. Kept as small/short-lived as possible.

import type { Journey } from "@/hooks/useJourneys";
import type { ClaimProfileInput } from "@/lib/claimProfileValidation";

const PENDING_KEY = "cmt_pending_claim_v1";

export type PendingClaim = {
  userId: string;
  journey: Journey;
  details: ClaimProfileInput;
  /** PNG of the signature, transparent background, as a data URL. */
  signatureDataUrl: string | null;
  savedAt: string;
};

export function savePendingClaim(pending: PendingClaim): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Quota / private-mode — nothing we can do; the user just re-enters later.
  }
}

export function loadPendingClaim(): PendingClaim | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingClaim;
  } catch {
    return null;
  }
}

export function clearPendingClaim(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** The profiles upsert row built from the inline details — shared by the modal's
 *  immediate path and the deferred replay so the column set can't drift. */
export function buildProfileRow(
  uid: string,
  d: ClaimProfileInput,
  signaturePath: string | null
) {
  return {
    id: uid,
    signature_path: signaturePath,
    first_name: d.firstName.trim() || null,
    last_name: d.lastName.trim() || null,
    full_name: `${d.firstName.trim()} ${d.lastName.trim()}`.trim() || null,
    claim_email: d.claimEmail.trim() || null,
    claim_mobile: d.claimMobile.trim() || null,
    claim_ticket_id: d.claimTicketId.trim() || null,
    claim_personnummer: d.claimPersonnummer.trim() || null,
    purchasing_operator: d.purchasingOperator || null,
    street_address: d.streetAddress.trim() || null,
    postal_code: d.postalCode.trim() || null,
    city: d.city.trim() || null,
    payout_method: d.payoutMethod || null,
  };
}

/** Read a Blob as a data URL (for stashing a drawn signature in localStorage). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Inverse of blobToDataUrl — turn a stored data URL back into a Blob to upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
