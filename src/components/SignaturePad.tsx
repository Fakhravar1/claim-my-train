import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface SignaturePadHandle {
  /** True when nothing has been drawn since mount / last clear. */
  isEmpty: () => boolean;
  clear: () => void;
  /** PNG (transparent background, dark strokes) of the current drawing, or null if empty. */
  toBlob: () => Promise<Blob | null>;
}

type Props = {
  className?: string;
  /** Fired with whether the pad currently holds ink, so callers can gate Save. */
  onChange?: (hasInk: boolean) => void;
};

/**
 * Minimal pointer-based signature canvas. Self-contained (no dependency) so it
 * builds the same on the Lovable mirror. The backing store is transparent —
 * only the strokes carry alpha — which lets the claim-worker stamp it onto the
 * reklamation form with mask="auto" so the form line shows through.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ className, onChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const hasInk = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    // Size the backing store to the element + devicePixelRatio for crisp lines.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#10204a";
    }, []);

    const pointAt = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleDown = (e: React.PointerEvent) => {
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pointAt(e);
    };

    const handleMove = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !last.current) return;
      const p = pointAt(e);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (!hasInk.current) {
        hasInk.current = true;
        onChange?.(true);
      }
    };

    const handleUp = () => {
      drawing.current = false;
      last.current = null;
    };

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk.current = false;
      onChange?.(false);
    }, [onChange]);

    useImperativeHandle(
      ref,
      () => ({
        isEmpty: () => !hasInk.current,
        clear,
        toBlob: () =>
          new Promise((resolve) => {
            const canvas = canvasRef.current;
            if (!canvas || !hasInk.current) {
              resolve(null);
              return;
            }
            canvas.toBlob((b) => resolve(b), "image/png");
          }),
      }),
      [clear]
    );

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          aria-label="Signaturfält"
          style={{
            width: "100%",
            height: 160,
            touchAction: "none",
            display: "block",
            borderRadius: 8,
            background: "#fff",
            border: "1px solid hsl(var(--border))",
            cursor: "crosshair",
          }}
        />
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
