import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const DISMISS_KEY = "qvitta-install-dismissed-at";
const REDISMISS_DAYS = 30;

function recentlyDismissed(): boolean {
  try {
    const at = localStorage.getItem(DISMISS_KEY);
    if (!at) return false;
    return Date.now() - Number(at) < REDISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Slim install-to-home-screen band on `/` — Chrome/Android gets a real install
 * button (beforeinstallprompt); iOS Safari gets the share-sheet instructions.
 * Hidden when already installed (standalone) or dismissed within 30 days.
 */
export function InstallBanner() {
  const { canPrompt, promptInstall, isStandalone, isIos } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  if (isStandalone || dismissed) return null;
  if (!canPrompt && !isIos) return null; // desktop browsers without prompt support: skip

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
    setDismissed(true);
  };

  return (
    <div className="install-banner" role="complementary" aria-label="Installera Qvitta">
      <div className="install-banner__text">
        <strong>Lägg till Qvitta på hemskärmen</strong>
        {canPrompt ? (
          <span>Snabbare åtkomst och notiser om förseningar på din pendlingsrutt.</span>
        ) : (
          <span>
            Öppna delningsmenyn <span aria-hidden="true">(⎋)</span> i Safari och välj{" "}
            <em>Lägg till på hemskärmen</em> — då kan du få notiser om förseningar.
          </span>
        )}
      </div>
      <div className="install-banner__actions">
        {canPrompt && (
          <button type="button" className="btn btn--accent btn--sm" onClick={promptInstall}>
            Installera
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={dismiss} aria-label="Stäng">
          Inte nu
        </button>
      </div>
    </div>
  );
}
