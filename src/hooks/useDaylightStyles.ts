import { useEffect } from "react";
import daylightCSS from "@/themes/daylight/daylight.css?inline";

/**
 * Inject the "Daylight" theme stylesheet into <head> while the merged app page
 * (`/`) is mounted, and remove it on unmount so the shadcn theme on /login and
 * /settings is never clobbered. All Daylight rules are scoped under
 * `.cmt-daylight` (page) / `.cmt-daylight-scrim` (modal portal), so the generic
 * class names (.btn, .row, .field, .modal, .tag) don't leak either.
 */
export function useDaylightStyles() {
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "cmt-daylight";
    el.textContent = daylightCSS;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
}
