import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";

// PWA service worker (registerType: "prompt"). A new deploy installs the new
// worker in the background but does NOT take over mid-session. Instead we surface
// a "ny version" toast; tapping Uppdatera calls updateSW(true), which posts
// SKIP_WAITING to the waiting worker (handled in src/sw.ts) and reloads onto the
// fresh bundle once it takes control. Replaces the old silent auto-update, which
// left already-open tabs / installed PWAs on a stale cached shell.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast("Ny version av Qvitta finns", {
      id: "pwa-update", // dedupe: never stack multiple update prompts
      description: "Uppdatera för att hämta de senaste ändringarna.",
      duration: Infinity,
      action: {
        label: "Uppdatera",
        onClick: () => updateSW(true),
      },
    });
  },
  onRegisteredSW(_swUrl, registration) {
    // An installed PWA can stay open for days without a navigation, so the
    // browser may never check for a new worker on its own. Poll hourly so the
    // update prompt still appears without needing a full app restart.
    if (registration) {
      setInterval(
        () => {
          registration.update().catch(() => {
            /* offline / transient — retry next tick */
          });
        },
        60 * 60 * 1000,
      );
    }
  },
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
