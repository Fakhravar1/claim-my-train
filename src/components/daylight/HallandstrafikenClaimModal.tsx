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
 * Hallandstrafiken claim pop-up. Hallandstrafiken's reklamation form has no BankID, so we
 * file it server-side via the headless worker (submit_hallandstrafiken) — no signature, no
 * PDF. The form needs ticket proof we don't store, so we collect the app-id / ticket number
 * here (stored on claims.booking_reference, same column SJ reuses) plus a contact email.
 *
 * The worker DRY-RUNs first (screenshot in "Mina ärenden") and only submits after the user
 * authorizes — so this pop-up just creates the pending claim; it never files anything itself.
 */
export function HallandstrafikenClaimModal({
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

  const [ticket, setTicket] = useState("");
  const [contact, setContact] = useState(profile?.claim_email ?? user?.email ?? "");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [serverError, setServerError] = useState<string | null>(null);

  const meta = useMemo(
    () => statusMeta(journey.destination_delay_minutes, Boolean(journey.canceled), journey.route_distance_km),
    [journey]
  );

  const ticketErr = touched && !ticket.trim() ? "Ange ditt app-id eller biljettnummer från Hallandstrafiken." : null;
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
    const res = await startClaim(journey, null, "hallandstrafiken", ticket.trim(), contact.trim());
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
        <ModalHead title="Ansök om ersättning · Hallandstrafiken" onClose={onClose} />
        <div className="modal__body">
          {phase === "done" ? (
            <div className="step">
              <div className="verdict verdict--eligible">
                <b>Tack! Vi förbereder din ansökan till Hallandstrafiken.</b> Vi fyller i formuläret med
                dina uppgifter och visar dig en förhandsgranskning innan något skickas in.
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
                Ange biljetten du reste med, så förbereder vi din ansökan hos Hallandstrafiken.
              </p>
              <Field label="App-id eller biljettnummer">
                <input
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="t.ex. app-id från Hallandstrafiken-appen"
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
