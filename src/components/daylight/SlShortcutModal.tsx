import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { operatorLabel } from "./Board";
import { purchasingOperatorClaimUrl } from "@/lib/claimProfileValidation";
import { Scrim, ModalHead } from "./primitives";

/**
 * SL claim hand-off pop-up. SL files on its own BankID-gated web form (no in-app
 * filing, no claims row — §1). On iPhone we hand the journey to the "Qvitta" iOS
 * Shortcut via a deep link: the Shortcut stashes the trip, opens SL, and after
 * BankID the user re-runs it from the share sheet to autofill the form (the
 * sl-fill-script edge function). On everything else we just link out to SL's form,
 * exactly as before.
 *
 * NOTE: this never files anything our side and never submits to SL — the user
 * reviews + submits behind BankID. The payload (PII) goes straight into the
 * Shortcut via the deep link; it never hits our server.
 */
const SL_FORM_URL =
  purchasingOperatorClaimUrl("sl") ?? "https://sl.se/kundservice/forseningsersattning/resan";

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; disambiguate by touch support.
    (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document));

export function SlShortcutModal({
  journey,
  onClose,
}: {
  journey: Journey;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const meta = useMemo(
    () => statusMeta(journey.destination_delay_minutes, Boolean(journey.canceled), journey.route_distance_km),
    [journey]
  );

  const time = journey.origin_scheduled
    ? new Date(journey.origin_scheduled).toLocaleTimeString("sv-SE", {
        timeZone: "Europe/Stockholm",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const email = profile?.claim_email ?? profile?.email ?? user?.email ?? "";
  const wantsBank = profile?.payout_method === "bank";
  const hasBank = Boolean(profile?.clearing_number && profile?.account_number);
  const bankWillFill = wantsBank && hasBank;

  const deepLink = useMemo(() => {
    const payload = {
      v: 1,
      op: "sl",
      origin: journey.origin_stop_name ?? "",
      destination: journey.destination_stop_name ?? "",
      date: journey.origin_local_date ?? "",
      time,
      delayMinutes: journey.canceled ? null : journey.destination_delay_minutes ?? null,
      email,
      clearing: bankWillFill ? profile?.clearing_number ?? "" : "",
      account: bankWillFill ? profile?.account_number ?? "" : "",
      url: SL_FORM_URL,
    };
    return `shortcuts://run-shortcut?name=Qvitta&input=${encodeURIComponent(JSON.stringify(payload))}`;
  }, [journey, time, email, bankWillFill, profile]);

  const dateLong = (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

  const ios = isIOS();

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Ansök om ersättning · SL" onClose={onClose} />
        <div className="modal__body">
          <div className="step">
            <div className="summary">
              <div className="summary__row"><span>Resa</span><b>{journey.origin_stop_name} → {journey.destination_stop_name}</b></div>
              <div className="summary__row"><span>Operatör</span><b>{operatorLabel(journey)}</b></div>
              <div className="summary__row"><span>Datum</span><b>{dateLong(journey.origin_local_date)}</b></div>
              <div className="summary__row"><span>Avgång</span><b>{time || "—"}</b></div>
              <div className="summary__row"><span>Försening</span><b>{journey.canceled ? "Inställt" : meta.minutes + " min"}</b></div>
            </div>

            {ios ? (
              <>
                <p className="lead">
                  SL kräver BankID på sitt eget formulär. Qvitta-genvägen tar med din resa dit och
                  fyller i formuläret åt dig.
                </p>
                <ol className="how">
                  <li>Tryck <b>Öppna SL via Qvitta</b> — genvägen sparar resan och öppnar SL.</li>
                  <li>Logga in med <b>BankID</b> på SL.</li>
                  <li>När formuläret visas: öppna <b>Dela-menyn</b> och kör <b>Qvitta</b>-genvägen igen — fälten fylls i.</li>
                  <li><b>Granska och skicka in själv.</b> Qvitta skickar aldrig in åt dig.</li>
                </ol>
                {!bankWillFill && (
                  <p className="muted">
                    Tips: lägg till bankuppgifter under{" "}
                    <button className="linklike" onClick={() => { onClose(); navigate("/settings"); }}>Inställningar</button>{" "}
                    (utbetalningssätt Bank), så fylls även utbetalningssidan i automatiskt.
                  </p>
                )}
              </>
            ) : (
              <p className="lead">
                SL hanterar ansökan på sitt eget formulär (kräver BankID). Den automatiska ifyllnaden
                finns just nu bara på iPhone — på den här enheten öppnar vi SL:s formulär så fyller du i
                resan ovan manuellt.
              </p>
            )}
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
          {ios ? (
            <a className="btn btn--accent" href={deepLink}>Öppna SL via Qvitta</a>
          ) : (
            <a className="btn btn--accent" href={SL_FORM_URL} target="_blank" rel="noreferrer">Öppna SL:s formulär</a>
          )}
        </div>
      </div>
    </Scrim>
  );
}
