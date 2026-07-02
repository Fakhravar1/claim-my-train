import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMarkFiledExternally } from "@/hooks/useStartClaim";
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

type ShortcutOperator =
  | "sl" | "skanetrafiken" | "vasttrafik" | "hallandstrafiken"
  | "varmlandstrafik" | "ostgotatrafiken" | "jlt" | "ul" | "malartag"
  | "tagibergslagen" | "kronoberg" | "blekingetrafiken" | "snalltaget" | "tagab";

type Profile = ReturnType<typeof useAuth>["profile"];

const OPS: Record<ShortcutOperator, {
  label: string;
  formUrl: string;
  /** Omitted for EXTERNAL-only operators: no Shortcut autofill, just link out to the form
   *  (e.g. Hallandstrafiken — its form geo-blocks our worker IP, so headless is backlogged). */
  scriptUrl?: string;
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
  // Skånetrafiken: the form is FULLY BankID-gated at entry (verified 2026-07-02, permanent).
  // iOS flow: run 1 opens the form (user does BankID on #/logga-in), run 2 injects the fill
  // script from the share sheet AFTER login — it polls the hash and fills steg-1/2/3 as the
  // user advances. Desktop still links out. Attestations + submit stay the user's (§8).
  skanetrafiken: {
    label: "Skånetrafiken",
    formUrl: "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/",
    scriptUrl: `${FN_BASE}/skanetrafiken-fill-script`,
    bankNudge: true,
    extras: (profile) => ({
      // steg-2 swedishBank fallback + payout routing; steg-3 contact fields.
      personnummer: profile?.claim_personnummer ?? "",
      payoutMethod: profile?.payout_method ?? "",
      mobile: profile?.claim_mobile ?? "",
    }),
  },
  // Västtrafik: EXTERNAL only for now — the iOS Shortcut autofill (vasttrafik-fill-script) is
  // still under development, so we DON'T hand iOS users a half-built flow; everyone just links
  // out to Västtrafik's form. Re-enable autofill by restoring `scriptUrl` + the `extras` payload
  // (mobile / payoutMethod / personnummer) once the fill script is validated on the live form.
  vasttrafik: {
    label: "Västtrafik",
    formUrl: "https://www.vasttrafik.se/kundservice/forseningsersattning/ansok-om-ersattning/",
    extras: () => ({}),
  },
  // EXTERNAL only (no scriptUrl): Hallandstrafiken's reklamation form geo-blocks our worker's
  // IP (US/datacenter), so headless filing is backlogged — for now just link the user out to
  // the form, which they reach fine from their own Swedish IP.
  hallandstrafiken: {
    label: "Hallandstrafiken",
    formUrl: "https://hallandstrafiken.se/kundservice/vanliga-arenden/forseningsersattning-och-reklamation/reklamation",
    extras: () => ({}),
  },
  // Regional länstrafik — EXTERNAL redirect for now (no fill script): link out to each operator's
  // own förseningsersättning form. Headless filing is a follow-up, reconned per form.
  varmlandstrafik: {
    label: "Värmlandstrafik",
    formUrl: "https://www.varmlandstrafik.se/varmlandstrafik/kundservice/forseningsersattning",
    extras: () => ({}),
  },
  ostgotatrafiken: {
    label: "Östgötatrafiken",
    formUrl: "https://www.ostgotatrafiken.se/kundservice/vanliga-arenden/forseningsersattning/",
    extras: () => ({}),
  },
  jlt: {
    label: "Jönköpings Länstrafik",
    formUrl: "https://www.jlt.se/kundservice/forseningsersattning/",
    extras: () => ({}),
  },
  ul: {
    label: "UL",
    formUrl: "https://www.ul.se/kundservice/forseningsersattning/",
    extras: () => ({}),
  },
  malartag: {
    label: "Mälartåg",
    formUrl: "https://www.malardalstrafik.se/kundservice/ersaettning-vid-foersening/",
    extras: () => ({}),
  },
  // EXTERNAL-only link-outs (no autofill). Tåg i Bergslagen was surfaced by the
  // Närke+Västmanland station fill; Kronoberg/Blekingetrafiken are now directly selectable;
  // Snälltåget is no longer inert; Tågab has no online form so its link-out is a mailto.
  tagibergslagen: {
    label: "Tåg i Bergslagen",
    formUrl: "https://evf.tagibergslagen.regionvastmanland.se",
    extras: () => ({}),
  },
  kronoberg: {
    label: "Länstrafiken Kronoberg",
    formUrl: "https://lanstrafikenkron.se/ansok-om-forseningsersattning",
    extras: () => ({}),
  },
  blekingetrafiken: {
    label: "Blekingetrafiken",
    formUrl: "https://respons.blekingetrafiken.se/internet/bltresegarantiv2.aspx",
    extras: () => ({}),
  },
  snalltaget: {
    label: "Snälltåget",
    formUrl: "https://www.snalltaget.se/min-resa",
    extras: () => ({}),
  },
  // Tågab has no web form — claims go by e-mail; the CTA opens a pre-addressed mailto.
  tagab: {
    label: "Tågab",
    formUrl: "mailto:installt@tagakeriet.se",
    extras: () => ({}),
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
  const queryClient = useQueryClient();
  const cfg = OPS[operator];

  // After the user opens the operator's form (or the Shortcut), ask whether they
  // actually submitted. "Ja" records a filed_externally claims row so the journey
  // stops being re-suggested (digest/MyDelays) and shows in "Mina ansökningar".
  // Signed-out users just get the link-out — nothing to track against.
  const { markFiledExternally, pending: marking } = useMarkFiledExternally();
  const [opened, setOpened] = useState(false);
  const [tracked, setTracked] = useState<"yes" | "error" | null>(null);

  async function confirmFiled() {
    const res = await markFiledExternally(journey, operator);
    if (res.ok) {
      setTracked("yes");
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
    } else {
      setTracked("error");
    }
  }

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

  // External-only operators (no scriptUrl) never use the iOS Shortcut path — just link out.
  const external = !cfg.scriptUrl;
  const ios = isIOS() && !external;

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
                <p className="muted">
                  Har du inte genvägen än?{" "}
                  <button className="linklike" onClick={() => { onClose(); navigate("/genvag"); }}>Installera Qvitta-genvägen</button>
                </p>
                {bankMissing && (
                  <p className="muted">
                    Tips: lägg till bankuppgifter under{" "}
                    <button className="linklike" onClick={() => { onClose(); navigate("/settings"); }}>Inställningar</button>{" "}
                    (utbetalningssätt Bank), så fylls även utbetalningssidan i automatiskt.
                  </p>
                )}
              </>
            ) : external ? (
              <p className="lead">
                {cfg.label} hanterar ansökan på sitt eget formulär. Vi öppnar det åt dig — fyll i
                resan ovan så går det snabbare.
              </p>
            ) : (
              <p className="lead">
                {cfg.label} hanterar ansökan på sitt eget formulär (kräver BankID). Den automatiska
                ifyllnaden finns just nu bara på iPhone — på den här enheten öppnar vi formuläret så
                fyller du i resan ovan manuellt.
              </p>
            )}

            {user && opened && (
              tracked === "yes" ? (
                <div className="verdict verdict--eligible">
                  <b>Noterat!</b> Resan finns nu under <b>Mina ansökningar</b> i inställningarna,
                  och vi föreslår den inte igen.
                </div>
              ) : (
                <div className="verdict verdict--near">
                  <p style={{ margin: "0 0 .5rem" }}>
                    <b>Skickade du in ansökan hos {cfg.label}?</b> Säg till så bockar vi av resan —
                    då tjatar vi inte om den igen och du kan följa den under Mina ansökningar.
                  </p>
                  <button className="btn btn--accent" disabled={marking} onClick={() => void confirmFiled()}>
                    {marking ? "Sparar…" : "Ja, jag har skickat in"}
                  </button>
                  {tracked === "error" && (
                    <p className="muted" style={{ margin: ".5rem 0 0" }}>
                      Det gick inte att spara just nu — du kan stänga rutan ändå.
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>{tracked === "yes" ? "Stäng" : "Avbryt"}</button>
          {ios ? (
            <a className="btn btn--accent" href={deepLink} onClick={() => setOpened(true)}>Öppna {cfg.label} via Qvitta</a>
          ) : (
            <a className="btn btn--accent" href={cfg.formUrl} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>Öppna {cfg.label}s formulär</a>
          )}
        </div>
      </div>
    </Scrim>
  );
}
