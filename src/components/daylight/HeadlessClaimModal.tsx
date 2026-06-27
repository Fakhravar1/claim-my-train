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
 * Filing pop-up for operators we file HEADLESSLY (no BankID web forms — Hallandstrafiken,
 * Kalmar). Their `respons` form needs ticket proof we don't store, so we collect the
 * app-id / ticket number here (claims.booking_reference) + a contact email, then create a
 * pending claim. The worker dry-runs + screenshots for review; the user authorizes the real
 * submit in "Mina ärenden". This pop-up never files anything itself (no signature, no PDF).
 */
export function HeadlessClaimModal({
  journey,
  operator,
  label,
  ticketLabel = "App-id eller biljettnummer",
  ticketPlaceholder,
  onClose,
  onFiled,
}: {
  journey: Journey;
  operator: string;
  label: string;
  /** What proof the operator's form needs (default: app-id/ticket no.). Vy wants a booking no. */
  ticketLabel?: string;
  ticketPlaceholder?: string;
  onClose: () => void;
  onFiled?: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { startClaim, pending } = useStartClaim();
  const queryClient = useQueryClient();

  const [ticket, setTicket] = useState("");
  const [contact, setContact] = useState(profile?.claim_email ?? user?.email ?? "");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [serverError, setServerError] = useState<string | null>(null);

  const meta = useMemo(
    () => statusMeta(journey.destination_delay_minutes, Boolean(journey.canceled), journey.route_distance_km),
    [journey]
  );

  const ticketErr = touched && !ticket.trim() ? `Ange ${ticketLabel.toLowerCase()} från ${label}.` : null;
  const contactErr = touched && Boolean(validateEmail(contact)) ? "Ange en giltig e-postadress." : null;
  const canSubmit = ticket.trim() && !validateEmail(contact) && !pending;

  const dateLong = (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

  async function submit() {
    setTouched(true);
    setServerError(null);
    if (!ticket.trim() || validateEmail(contact)) return;
    if (!user) {
      navigate("/settings");
      return;
    }
    const res = await startClaim(journey, null, operator, ticket.trim(), contact.trim());
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
        <ModalHead title={`Ansök om ersättning · ${label}`} onClose={onClose} />
        <div className="modal__body">
          {phase === "done" ? (
            <div className="step">
              <div className="verdict verdict--eligible">
                <b>Tack! Vi förbereder din ansökan till {label}.</b> Vi fyller i formuläret med dina
                uppgifter och visar dig en förhandsgranskning innan något skickas in.
              </div>
              <p className="muted">Granska och godkänn under <b>Mina ärenden</b> i inställningarna.</p>
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
                Ange biljetten du reste med, så förbereder vi din ansökan hos {label}.
              </p>
              <Field label={ticketLabel}>
                <input
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={ticketPlaceholder ?? `t.ex. app-id från ${label}-appen`}
                  autoComplete="off"
                  aria-invalid={Boolean(ticketErr)}
                />
              </Field>
              {ticketErr && <span className="field__err">{ticketErr}</span>}
              <Field label="E-postadress">
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
              {serverError && <div className="verdict verdict--near">{serverError}</div>}
            </div>
          )}
        </div>
        {phase === "form" && (
          <div className="modal__foot">
            <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
            <button className="btn btn--accent" disabled={!canSubmit} onClick={() => void submit()}>
              {pending ? "Skickar…" : "Förbered ansökan"} <CheckIcon width={16} height={16} />
            </button>
          </div>
        )}
      </div>
    </Scrim>
  );
}
