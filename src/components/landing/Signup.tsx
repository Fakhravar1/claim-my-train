import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

type Props = {
  scene: ReactNode;
  /** Section heading. Defaults to the "Sign in once" copy. */
  title?: ReactNode;
  /** Lead paragraph. Defaults to the reassurance copy. */
  lead?: ReactNode;
  /** Small print below the CTA. */
  small: ReactNode;
  /** Optional custom CTA element. Defaults to a Google sign-in button. */
  cta?: ReactNode;
};

function DefaultGoogleCTA() {
  const { signInWithGoogle } = useAuth();
  return (
    <button type="button" className="cmt-btn cmt-btn--lg" onClick={() => signInWithGoogle("/app")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.35 11.1H12v3.83h5.51c-.5 2.6-2.7 4.07-5.5 4.07-3.27 0-5.91-2.65-5.91-5.91s2.64-5.91 5.91-5.91c1.41 0 2.68.5 3.69 1.32l2.78-2.78C16.78 4.32 14.55 3.4 12 3.4 6.93 3.4 2.8 7.53 2.8 12.6S6.93 21.8 12 21.8c5.27 0 9.6-3.84 9.6-9.6 0-.42-.04-.86-.13-1.27z" />
      </svg>
      Sign in with Google
    </button>
  );
}

export default function Signup({
  scene,
  title,
  lead,
  small,
  cta,
}: Props) {
  return (
    <section className="signup" id="signup">
      <div className="signup__scene" aria-hidden="true">
        {scene}
      </div>

      <div className="wrap">
        <div className="signup__inner">
          <span className="section-head__eyebrow reveal">Ready when you are</span>
          <h2 className="section-head__title reveal" style={{ marginTop: "0.5rem" }}>
            {title ?? <>Sign in once. <em>Sleep through every delay.</em></>}
          </h2>
          <p className="section-head__lead reveal">
            {lead ?? (
              <>
                We'll never ask for your bank password and we'll never spam you. You can pause it any time.
              </>
            )}
          </p>
          <div className="signup__cta reveal">
            {cta ?? <DefaultGoogleCTA />}
            <p className="signup__small">{small}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
