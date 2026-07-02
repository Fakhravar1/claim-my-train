import { useState } from "react";
import type { Journey } from "@/hooks/useJourneys";
import {
  PURCHASING_OPERATORS,
  purchasingOperatorLabel,
  resolveOperatorFromJourney,
  type PurchasingOperator,
} from "@/lib/claimProfileValidation";
import { operatorLabel } from "./Board";
import { Scrim, ModalHead } from "./primitives";

/**
 * First step of a claim: pick WHICH operator's flow to file through. We auto-detect the
 * operator FROM THE JOURNEY (Trafikverket information_owner / train_owner) and, when we can,
 * present it as a single one-tap confirm ("Ansök hos SJ") instead of an 18-item list — the
 * user no longer has to choose, only confirm. A "byt operatör" affordance reveals the full
 * list for the rare mislabel / when we can't detect (§8: keep a human confirmation before
 * filing a real claim rather than fully-silent auto-routing). Öresundståg resolves here too;
 * the parent then origin-routes it to the right länstrafikbolag.
 */
export function OperatorChoiceModal({
  journey,
  onChoose,
  onClose,
}: {
  journey: Journey;
  onChoose: (operator: PurchasingOperator) => void;
  onClose: () => void;
}) {
  const detected = resolveOperatorFromJourney(journey);
  // When detected, start collapsed (one-tap confirm); when not, show the list immediately.
  const [showAll, setShowAll] = useState(!detected);

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Ansök om ersättning" onClose={onClose} />
        <div className="modal__body">
          <div className="step">
            <div className="summary">
              <div className="summary__row"><span>Resa</span><b>{journey.origin_stop_name} → {journey.destination_stop_name}</b></div>
              <div className="summary__row"><span>Operatör (resa)</span><b>{operatorLabel(journey)}</b></div>
            </div>

            {detected && !showAll ? (
              <>
                <p className="lead">
                  Vi känner igen den här resan som <b>{purchasingOperatorLabel(detected)}</b> och
                  tar dig direkt till rätt flöde.
                </p>
                <button className="btn btn--primary btn--block btn--lg" onClick={() => onChoose(detected)}>
                  Ansök hos {purchasingOperatorLabel(detected)}
                </button>
                <button className="linkbtn linkbtn--center" onClick={() => setShowAll(true)}>
                  Det stämmer inte – välj annan operatör
                </button>
              </>
            ) : (
              <>
                <p className="lead">Vilken operatör vill du ansöka hos? Vi tar dig till rätt formulär eller flöde.</p>
                <div className="operator-pick">
                  {PURCHASING_OPERATORS.map((o) => (
                    <button
                      key={o.value}
                      className={`btn btn--block ${o.value === detected ? "btn--primary" : "btn--ghost"}`}
                      onClick={() => onChoose(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </Scrim>
  );
}
