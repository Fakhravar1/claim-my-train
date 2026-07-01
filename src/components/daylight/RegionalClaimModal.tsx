import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMarkFiledExternally } from "@/hooks/useStartClaim";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { operatorLabel } from "./Board";
import {
  REGION_AUTHORITIES,
  type RegionAuthorityKey,
} from "@/lib/claimProfileValidation";
import { Scrim, ModalHead, Field } from "./primitives";

/**
 * Öresundståg claim routing (Öresundståg-specific). An Öresundståg delay is claimed at the
 * länstrafikbolag of the county where the journey STARTED — derived from the origin station
 * (v_station_claim_authority -> useStationAuthorities). Skåne/Köpenhamn-origin files in-app
 * (the Skånetrafiken PDF) and never reaches this modal; the other counties have their own
 * forms, so here we confirm the derived authority (with an override, per "the user chooses
 * the domain they started in") and link OUT to that bolag's form — no claims row is stored,
 * the same pattern as SL.
 */
const ORDER: RegionAuthorityKey[] = [
  "skanetrafiken", "hallandstrafiken", "blekingetrafiken", "kalmar", "kronoberg", "vasttrafik",
];

export function RegionalClaimModal({
  journey,
  derivedKey,
  onUseInApp,
  onClose,
}: {
  journey: Journey;
  derivedKey: RegionAuthorityKey;
  /** Called when the chosen authority files in-app (Skånetrafiken) — parent opens ClaimModal. */
  onUseInApp: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<RegionAuthorityKey>(derivedKey);
  const auth = REGION_AUTHORITIES[selected];

  // Same external-filing tracking as ShortcutClaimModal: after the link-out, let
  // the user confirm they submitted → filed_externally claims row (stops the
  // digest/MyDelays from re-suggesting; visible in "Mina ansökningar").
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { markFiledExternally, pending: marking } = useMarkFiledExternally();
  const [opened, setOpened] = useState(false);
  const [tracked, setTracked] = useState<"yes" | "error" | null>(null);

  async function confirmFiled() {
    const res = await markFiledExternally(journey, selected);
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
  const dateLong = (iso: string | null | undefined) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Ansök om ersättning · Öresundståg" onClose={onClose} />
        <div className="modal__body">
          <div className="step">
            <div className="summary">
              <div className="summary__row"><span>Resa</span><b>{journey.origin_stop_name} → {journey.destination_stop_name}</b></div>
              <div className="summary__row"><span>Operatör</span><b>{operatorLabel(journey)}</b></div>
              <div className="summary__row"><span>Datum</span><b>{dateLong(journey.origin_local_date)}</b></div>
              <div className="summary__row"><span>Försening</span><b>{journey.canceled ? "Inställt" : meta.minutes + " min"}</b></div>
            </div>

            <p className="lead">
              För Öresundståg ansöker du hos länstrafikbolaget i länet där resan <b>påbörjades</b>.
              Din resa startade i <b>{REGION_AUTHORITIES[derivedKey].county}</b> — då gäller{" "}
              <b>{REGION_AUTHORITIES[derivedKey].label}</b>.
            </p>

            <Field label="Stämmer det inte? Välj var resan startade">
              <select value={selected} onChange={(e) => setSelected(e.target.value as RegionAuthorityKey)}>
                {ORDER.map((k) => (
                  <option key={k} value={k}>{REGION_AUTHORITIES[k].county} · {REGION_AUTHORITIES[k].label}</option>
                ))}
              </select>
            </Field>

            {auth.inApp ? (
              <div className="verdict verdict--eligible">
                <b>{auth.label}</b> hanteras direkt i appen — vi fyller i reklamationen åt dig.
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 4 }}>
                {auth.label} har ett eget formulär. Vi öppnar det åt dig i en ny flik — fyll i
                din boknings-/biljettinformation där. Säg till efteråt om du skickade in, så
                bockar vi av resan.
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
                    <b>Skickade du in ansökan hos {auth.label}?</b>
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
          {auth.inApp ? (
            <button className="btn btn--accent" onClick={onUseInApp}>Ansök i appen</button>
          ) : (
            <a
              className="btn btn--accent"
              href={auth.externalClaimUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
            >
              Öppna {auth.label}s formulär
            </a>
          )}
        </div>
      </div>
    </Scrim>
  );
}
