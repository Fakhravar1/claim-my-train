import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { operatorLabel } from "./Board";
import { Scrim, ModalHead } from "./primitives";

/**
 * Operator-agnostic claim hand-off pop-up. Operators that file on their own
 * BankID-gated web form (SL, Skånetrafiken-online) are handed to the "Qvitta"
 * iOS Shortcut via a deep link. The payload carries WHERE to open (`url`) and
 * WHICH fill script to run (`script`), so a single Shortcut serves every
 * operator — adding one is a new edge function + a config row here, no Shortcut
 * change. On non-iOS we just link out to the operator's form.
 *
 * Never files our side, never submits — the user reviews + submits behind BankID.
 * PII rides in the deep link straight to the Shortcut; it never hits our server.
 */
const FN_BASE = "https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1";

type ShortcutOperator = "sl" | "skanetrafiken" | "vasttrafik";

type Profile = ReturnType<typeof useAuth>["profile"];

const OPS: Record<ShortcutOperator, {
  label: string;
  formUrl: string;
  scriptUrl: string;
  /** Operator-specific payload fields beyond the common journey + email. */
  extras: (profile: Profile) => Record<string, string>;
  /** SL needs a bank account in the payload; nudge if it's missing. */
  bankNudge?: boolean;
}> = {
  sl: {
    label: "SL",
    formUrl: "https://sl.se/kundservice/forseningsersattning/resan",
    scriptUrl: `${FN_BASE}/sl-fill-script`,
    bankNudge: true,
    extras: (profile) => {
      const ok = profile?.payout_method === "bank" && Boolean(profile?.clearing_number && profile?.account_number);
      return { clearing: ok ? profile?.clearing_number ?? "" : "", account: ok ? profile?.account_number ?? "" : "" };
    },
  },
  skanetrafiken: {
    label: "Skånetrafiken",
    formUrl: "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/#/logga-in",
    scriptUrl: `${FN_BASE}/skanetrafiken-fill-script`,
    // swedishBank pays to the account registered to the BankID personnummer — no
    // account entry. We pass mobile + payout method + personnummer (its socialSecurityNumber
    // field is BankID-prefilled, so the fill only acts as a fallback when empty).
    extras: (profile) => ({
      mobile: profile?.claim_mobile ?? "",
      payoutMethod: profile?.payout_method ?? "",
      personnummer: profile?.claim_personnummer ?? "",
    }),
  },
  vasttrafik: {
    label: "Västtrafik",
    formUrl: "https://www.vasttrafik.se/kundservice/forseningsersattning/ansok-om-ersattning/",
    scriptUrl: `${FN_BASE}/vasttrafik-fill-script`,
    // BankID is at the END; section ③ "Kontaktuppgifter" is only a personnummer field.
    extras: (profile) => ({
      mobile: profile?.claim_mobile ?? "",
      payoutMethod: profile?.payout_method ?? "",
      personnummer: profile?.claim_personnummer ?? "",
    }),
  },
};

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document));

export function ShortcutClaimModal({
  journey,
  operator,
  onClose,
}: {
  journey: Journey;
  operator: ShortcutOperator;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const cfg = OPS[operator];

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
  const bankMissing = cfg.bankNudge && !(profile?.payout_method === "bank" && profile?.clearing_number && profile?.account_number);

  const deepLink = useMemo(() => {
    const payload = {
      v: 1,
      op: operator,
      origin: journey.origin_stop_name ?? "",
      destination: journey.destination_stop_name ?? "",
      date: journey.origin_local_date ?? "",
      time,
      delayMinutes: journey.canceled ? null : journey.destination_delay_minutes ?? null,
      email,
      url: cfg.formUrl,
      script: cfg.scriptUrl,
      ...cfg.extras(profile),
    };
    return `shortcuts://run-shortcut?name=Qvitta&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`;
  }, [journey, time, email, operator, profile, cfg]);

  const dateLong = (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

  const ios = isIOS();

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title={`Ansök om ersättning · ${cfg.label}`} onClose={onClose} />
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
                  {cfg.label} kräver BankID på sitt eget formulär. Qvitta-genvägen tar med din resa dit
                  och fyller i formuläret åt dig.
                </p>
                <ol className="how">
                  <li>Tryck <b>Öppna {cfg.label} via Qvitta</b> — genvägen sparar resan och öppnar {cfg.label}.</li>
                  <li>Logga in med <b>BankID</b>.</li>
                  <li>När formuläret visas: öppna <b>Dela-menyn</b> och kör <b>Qvitta</b>-genvägen igen — fälten fylls i.</li>
                  <li><b>Granska, välj din resa om det behövs, och skicka in själv.</b> Qvitta skickar aldrig in åt dig.</li>
                </ol>
                {bankMissing && (
                  <p className="muted">
                    Tips: lägg till bankuppgifter under{" "}
                    <button className="linklike" onClick={() => { onClose(); navigate("/settings"); }}>Inställningar</button>{" "}
                    (utbetalningssätt Bank), så fylls även utbetalningssidan i automatiskt.
                  </p>
                )}
              </>
            ) : (
              <p className="lead">
                {cfg.label} hanterar ansökan på sitt eget formulär (kräver BankID). Den automatiska
                ifyllnaden finns just nu bara på iPhone — på den här enheten öppnar vi formuläret så
                fyller du i resan ovan manuellt.
              </p>
            )}
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
          {ios ? (
            <a className="btn btn--accent" href={deepLink}>Öppna {cfg.label} via Qvitta</a>
          ) : (
            <a className="btn btn--accent" href={cfg.formUrl} target="_blank" rel="noreferrer">Öppna {cfg.label}s formulär</a>
          )}
        </div>
      </div>
    </Scrim>
  );
}
