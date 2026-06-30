import { useState } from "react";
import { Scrim, ModalHead } from "./primitives";

/**
 * "Vilka operatörer stödjer vi?" — a plain-language popup explaining which regions/operators
 * Qvitta covers and HOW a claim is filed for each. Honest about current status: some operators
 * we file directly, some we autofill via the iPhone Shortcut, some we link out to, and some are
 * ingested but not yet filable. Copy is editorial (not derived from the data model) so it can be
 * worded for users; keep it in sync with PURCHASING_OPERATORS routing when an operator graduates.
 */
type Mode = "direct" | "assist" | "redirect" | "soon";

// Reuse the board's existing scrim tag tones (ontime/near/minor/eligible) — no new CSS needed.
const MODE_META: Record<Mode, { label: string; tone: string }> = {
  direct: { label: "Direkt i appen", tone: "ontime" },
  assist: { label: "Autofyll på iPhone", tone: "near" },
  redirect: { label: "Vidarekoppling", tone: "minor" },
  soon: { label: "På väg", tone: "eligible" },
};

const ROWS: { operator: string; region: string; how: string; mode: Mode }[] = [
  { operator: "Skånetrafiken", region: "Skåne", how: "Vi skapar din ansökan (PDF) — på iPhone även autofyll i deras formulär.", mode: "direct" },
  { operator: "Öresundståg", region: "Sydsverige (dit resan startade)", how: "Skåne/Köpenhamn: direkt i appen. Övriga län: vidarekoppling till länstrafiken.", mode: "direct" },
  { operator: "Kalmar länstrafik", region: "Kalmar län", how: "Vi fyller i åt dig — du granskar och godkänner innan inskick.", mode: "direct" },
  { operator: "Vy (Vy Tåg)", region: "Vy-tåg i Sverige", how: "Vi fyller i åt dig — du granskar och godkänner innan inskick.", mode: "direct" },
  { operator: "SL", region: "Stockholm", how: "Autofyll via Qvitta-genvägen på iPhone — du loggar in med BankID och skickar in.", mode: "assist" },
  { operator: "Västtrafik", region: "Göteborg / Västra Götaland", how: "Autofyll via Qvitta-genvägen på iPhone — BankID hos Västtrafik.", mode: "assist" },
  { operator: "Hallandstrafiken", region: "Halland", how: "Vi öppnar deras formulär åt dig — du fyller i resten.", mode: "redirect" },
  { operator: "Värmlandstrafik", region: "Värmland", how: "Vi öppnar deras formulär åt dig — du fyller i resten.", mode: "redirect" },
  { operator: "Östgötatrafiken", region: "Östergötland", how: "Vi öppnar deras formulär åt dig — du fyller i resten.", mode: "redirect" },
  { operator: "Jönköpings Länstrafik", region: "Jönköpings län", how: "Vi öppnar deras formulär åt dig — du fyller i resten.", mode: "redirect" },
  { operator: "UL", region: "Uppsala län", how: "Vi öppnar deras formulär åt dig — välj UL under Inställningar.", mode: "redirect" },
  { operator: "Mälartåg", region: "Mälardalen / Stockholm regional", how: "Vi öppnar deras formulär åt dig — du fyller i resten.", mode: "redirect" },
  { operator: "SJ", region: "Hela landet (tyngdpunkt södra/mellersta Sverige)", how: "Förseningar visas redan — direktansökan i appen är på väg.", mode: "soon" },
];

export function CoverageModal({ onClose }: { onClose: () => void }) {
  return (
    <Scrim onClose={onClose}>
      <div className="modal">
        <ModalHead title="Operatörer & regioner vi stödjer" onClose={onClose} />
        <div className="modal__body">
          <p className="lead">
            Qvitta bevakar tågförseningar i hela Sverige. Hur själva ersättningsansökan görs beror
            på operatören — här är vad som gäller idag.
          </p>
          <div className="coverage">
            {ROWS.map((r) => (
              <div className="coverage__row" key={r.operator}>
                <div className="coverage__op">
                  <b>{r.operator}</b>
                  <span className="muted">{r.region}</span>
                </div>
                <div className="coverage__how">{r.how}</div>
                <span className={"tag tag--" + MODE_META[r.mode].tone}>{MODE_META[r.mode].label}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            <b>Direkt i appen</b> = vi skapar ansökan åt dig. <b>Autofyll på iPhone</b> = genvägen
            fyller i operatörens formulär, du signerar med BankID. <b>Vidarekoppling</b> = vi öppnar
            deras formulär. <b>På väg</b> = bevakas redan, ansökan kommer snart.
          </p>
        </div>
        <div className="modal__foot">
          <button className="btn btn--accent" onClick={onClose}>Stäng</button>
        </div>
      </div>
    </Scrim>
  );
}

/** Self-contained trigger + modal — drop <CoverageButton/> wherever a link fits (e.g. the footer). */
export function CoverageButton({ className = "linklike" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>Vilka operatörer stödjer vi?</button>
      {open && <CoverageModal onClose={() => setOpen(false)} />}
    </>
  );
}
