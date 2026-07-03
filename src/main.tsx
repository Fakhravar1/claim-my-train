import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// PWA service worker: auto-updates on new deploys (navigations are
// network-first in src/sw.ts, so no stale-bundle risk).
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
