import { useEffect } from "react";
import appShellCSS from "@/themes/regional-app-base.css?inline";

/**
 * Inject the regional app-shell stylesheet (and optionally a region theme
 * override) into <head> while the calling page is mounted. On unmount, remove
 * both <style> elements so the shadcn theme on /login, /settings, etc. isn't
 * clobbered by the cmt-* :root overrides.
 *
 * Region pages: useAppShellStyles(themeCSS) where themeCSS is imported via
 *   `import theme from "@/themes/<slug>/theme.css?inline"`.
 */
export function useAppShellStyles(extra?: string) {
  useEffect(() => {
    const base = document.createElement("style");
    base.id = "cmt-app-shell-base";
    base.textContent = appShellCSS;
    document.head.appendChild(base);

    let theme: HTMLStyleElement | null = null;
    if (extra) {
      theme = document.createElement("style");
      theme.id = "cmt-app-shell-theme";
      theme.textContent = extra;
      document.head.appendChild(theme);
    }

    return () => {
      base.remove();
      theme?.remove();
    };
  }, [extra]);
}
