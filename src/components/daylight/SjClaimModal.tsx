import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useStartClaim } from "@/hooks/useStartClaim";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { operatorLabel } from "./Board";
import { validateEmail } from "@/lib/claimProfileValidation";
import { Scrim, ModalHead, Field } from "./primitives";
import { CheckIcon } from "./icons";

/**
 * SJ-specific claim pop-up. SJ trips aren't standing commutes, so we don't have a booking
 * on file — we ask for the two inputs SJ's no-login form needs (booking/ticket number +
 * the email/phone used at purchase) right here. The email DEFAULTS to the account email
 * but is editable (a ticket may have been bought with a different address).
 *
 * Client-side validation mirrors SJ's own first-page rules (booking = 8 or 12 chars), so
 * the obvious mistakes are caught instantly. SJ's server-side "no matching journey" check
 * (wrong booking/email that still passes format) runs in the worker (submit_sj) and the
 * result surfaces on the claim — see the note below and "Mina ärenden".
 */
const cleanBooking = (s: string) => s.replace(/\s+/g, "").toUpperCase();
const isValidBooking = (s: string) => /^[A-Z0-9]{8}$|^[A-Z0-9]{12}$/.test(cleanBooking(s));
const isValidContact = (s: string) => {
  const v = s.trim();
  if (!v) return false;
  if (v.includes("@")) return !validateEmail(v); // validateEmail returns an error string or null
  return (v.replace(/[^\d]/g, "").length >= 6); // otherwise treat as a phone number
};

export function SjClaimModal({
  journey,
  onClose,
  onFiled,
}: {
  journey: Journey;
  onClose: () => void;
  onFiled?: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { startClaim, pending } = useStartClaim();
  const queryClient = useQueryClient();

  const [booking, setBooking] = useState("");
  const [contact, setContact] = useState(profile?.claim_email ?? user?.email ?? "");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [serverError, setServerError] = useState<string | null>(null);

  const meta = useMemo(
    () => statusMeta(journey.destination_delay_minutes, Boolean(journey.canceled), journey.route_distance_km),
    [journey]
  );

  const bookingErr = touched && !isValidBooking(booking)
    ? "Boknings- eller biljettnumret ska vara 8 eller 12 tecken." : null;
  const contactErr = touched && !isValidContact(contact)
    ? "Ange e-posten eller mobilnumret du använde vid köpet." : null;
  const canSubmit = isValidBooking(booking) && isValidContact(contact) && !pending;

  const dateLong = (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

  async function submit() {
    setTouched(true);
    setServerError(null);
    if (!isValidBooking(booking) || !isValidContact(contact)) return;
    if (!user) {
      navigate("/settings");
      return;
    }
    const res = await startClaim(
      journey,
      profile?.signature_path ?? null,
      "sj",
      cleanBooking(booking),
      contact.trim()
    );
    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      onFiled?.();
      setPhase("done");
    } else if (res.error.includes("already started")) {
      setServerError("Du har redan påbörjat en ansökan för den här resan.");
    } else {
      setServerError(res.error);
    }
  }

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Ansök om ersättning · SJ" onClose={onClose} />
        <div className="modal__body">
          {phase === "done" ? (
            <div className="step">
              <div className="verdict verdict--eligible">
                <b>Tack! Vi förbereder din ansökan till SJ.</b> Vi fyller i SJ:s formulär med uppgifterna
                du angav. Stämmer inte boknings­numret eller e-posten hör vi av oss så du kan rätta dem.
              </div>
              <p className="muted">Du kan följa ärendet under <b>Mina ärenden</b> i inställningarna.</p>
              <div className="acct__btns">
                <button className="btn btn--accent btn--block" onClick={() => { onClose(); navigate("/settings"); }}>
                  Till Mina ärenden
                </button>
                <button className="btn btn--ghost btn--block" onClick={onClose}>Stäng</button>
              </div>
            </div>
          ) : (
            <div className="step">
              <div className="summary">
                <div className="summary__row"><span>Resa</span><b>{journey.origin_stop_name} → {journey.destination_stop_name}</b></div>
                <div className="summary__row"><span>Operatör</span><b>{operatorLabel(journey)}</b></div>
                <div className="summary__row"><span>Datum</span><b>{dateLong(journey.origin_local_date)}</b></div>
                <div className="summary__row"><span>Försening</span><b>{journey.canceled ? "Inställt" : meta.minutes + " min"}</b></div>
              </div>
              <p className="lead">
                Ange uppgifterna från din SJ-bokning, så skickar vi in ansökan åt dig.
              </p>
              <Field label="Boknings- eller biljettnummer">
                <input
                  value={booking}
                  onChange={(e) => setBooking(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="t.ex. WRBYFG3K"
                  autoComplete="off"
                  aria-invalid={Boolean(bookingErr)}
                />
              </Field>
              {bookingErr && <span className="field__err">{bookingErr}</span>}
              <Field label="E-post eller mobilnummer (samma som vid köpet)">
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="namn@exempel.se"
                  autoComplete="email"
                  aria-invalid={Boolean(contactErr)}
                />
              </Field>
              {contactErr && <span className="field__err">{contactErr}</span>}
              <p className="muted" style={{ marginTop: 4 }}>
                Vi har fyllt i din konto-e-post. Köpte du biljetten med en annan adress eller ett
                mobilnummer? Ändra fältet ovan — SJ matchar på uppgiften från köpet.
              </p>
              {serverError && <div className="verdict verdict--near">{serverError}</div>}
            </div>
          )}
        </div>
        {phase === "form" && (
          <div className="modal__foot">
            <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
            <button className="btn btn--accent" disabled={!canSubmit} onClick={() => void submit()}>
              {pending ? "Skickar…" : "Skicka ansökan"} <CheckIcon width={16} height={16} />
            </button>
          </div>
        )}
      </div>
    </Scrim>
  );
}
