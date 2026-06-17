import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

/**
 * Modal scrim — ported from the prototype's `Scrim`. Renders through a portal
 * to <body> (so it isn't clipped by the page) inside a `.cmt-daylight-scrim`
 * wrapper that carries the Daylight tokens + modal CSS. Closes on Esc and on
 * scrim mousedown; locks body scroll while open.
 */
export function Scrim({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="cmt-daylight-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="modal__head">
      <span className="modal__title">{title}</span>
      <button className="iconbtn" onClick={onClose} aria-label="Stäng">
        <CloseIcon width={18} height={18} />
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
