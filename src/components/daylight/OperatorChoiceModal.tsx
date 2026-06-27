import type { Journey } from "@/hooks/useJourneys";
import { PURCHASING_OPERATORS, type PurchasingOperator } from "@/lib/claimProfileValidation";
import { operatorLabel } from "./Board";
import { Scrim, ModalHead } from "./primitives";

/**
 * First step of every claim: let the user pick WHICH operator's site/flow to file
 * through, rather than silently inferring it from the saved profile (which was
 * routing every claim to the user's stored default ticket operator — wrong whenever
 * the journey was actually a different operator). Shown for every real journey, for
 * every operator including Skånetrafiken — the parent then dispatches to the right
 * per-operator modal once the user has chosen.
 */
const INERT: readonly string[] = ["snalltaget", "other"];

export function OperatorChoiceModal({
  journey,
  onChoose,
  onClose,
}: {
  journey: Journey;
  onChoose: (operator: PurchasingOperator) => void;
  onClose: () => void;
}) {
  const hint = operatorLabel(journey);

  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Ansök om ersättning" onClose={onClose} />
        <div className="modal__body">
          <div className="step">
            <div className="summary">
              <div className="summary__row"><span>Resa</span><b>{journey.origin_stop_name} → {journey.destination_stop_name}</b></div>
              <div className="summary__row"><span>Operatör (resa)</span><b>{hint}</b></div>
            </div>
            <p className="lead">Vilken operatör vill du ansöka hos? Vi tar dig till rätt formulär eller flöde.</p>
            <div className="operator-pick">
              {PURCHASING_OPERATORS.map((o) => {
                const inert = INERT.includes(o.value);
                return (
                  <button
                    key={o.value}
                    className="btn btn--ghost btn--block"
                    disabled={inert}
                    title={inert ? "Inte tillgängligt än" : undefined}
                    onClick={() => onChoose(o.value)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </Scrim>
  );
}
