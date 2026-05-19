import { useEffect } from "react";
import landingCSS from "@/themes/landing-base.css?inline";

/**
 * Inject the landing-page stylesheet (and optionally a region theme override)
 * into <head> while the calling component is mounted. On unmount, remove both
 * <style> elements so the in-app shadcn theme on /app, /login, /settings, etc.
 * isn't clobbered by the landing's `:root` overrides.
 *
 * Region pages: useLandingStyles(themeCSS) where themeCSS is imported via
 *   `import theme from "@/themes/<slug>/theme.css?inline"`.
 */
export function useLandingStyles(extra?: string) {
  useEffect(() => {
    const base = document.createElement("style");
    base.id = "cmt-landing-base";
    base.textContent = landingCSS;
    document.head.appendChild(base);

    let theme: HTMLStyleElement | null = null;
    if (extra) {
      theme = document.createElement("style");
      theme.id = "cmt-landing-theme";
      theme.textContent = extra;
      document.head.appendChild(theme);
    }

    return () => {
      base.remove();
      theme?.remove();
    };
  }, [extra]);
}
