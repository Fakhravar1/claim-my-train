import { Link } from "react-router-dom";
import { useLandingStyles } from "@/hooks/useLandingStyles";
import themeCSS from "@/themes/sl/theme.css?inline";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import ProblemStats, { PROBLEM_ICONS } from "@/components/landing/ProblemStats";
import HowItWorks from "@/components/landing/HowItWorks";
import TrustBand from "@/components/landing/TrustBand";
import Signup from "@/components/landing/Signup";
import Footer from "@/components/landing/Footer";
import TravellingVehicle from "@/components/landing/TravellingVehicle";
import SLHero from "@/themes/sl/HeroScene";
import SLSignup from "@/themes/sl/SignupScene";
import SLVehicle from "@/themes/sl/Vehicle";

/**
 * SL regional page — themed placeholder. Stockholm support is not yet live;
 * the bottom CTA points users at the live Skånetrafiken service via /app.
 * Trust/problem/how-it-works sections preview what the page becomes at launch.
 */
export default function SL() {
  useLandingStyles(themeCSS);

  return (
    <>
      <Nav variant="regional" operatorName="SL" />

      <Hero
        scene={<SLHero />}
        eyebrow="Stockholm · Tunnelbana, Pendeltåg & tvärbana"
        title={
          <>
            Skip the claim form.<br />
            We file your <em>SL</em><br />
            refunds <em>automatically.</em>
          </>
        }
        lead={
          <>
            Daily Tunnelbana or Pendeltåg into the city? When your line arrives 20&nbsp;minutes
            late, you're owed 100&nbsp;KR. We watch every departure, file the claim, and put
            the money back in your account. <strong>You don't lift a finger.</strong>
          </>
        }
      />

      <ProblemStats
        eyebrow="The reality"
        title={<>Your Tunnelbana car is late. <em>Again.</em></>}
        lead={
          <>
            SL owes you <strong>100&nbsp;KR</strong> every time your train or tram arrives
            20&nbsp;minutes late or more. Most commuters never file. The form takes twelve
            minutes. The delay already cost you the rest of your morning.
          </>
        }
        stats={[
          { value: "20 min", label: "The minimum delay that earns you a 100 KR refund.", icon: PROBLEM_ICONS.clock },
          { value: "6,140", label: "Tunnelbana and Pendeltåg delays in the last year", icon: PROBLEM_ICONS.chart },
          { value: "12 min", label: <>The time the SL form takes &mdash; per delay.</>, icon: PROBLEM_ICONS.house },
        ]}
      />

      <HowItWorks
        steps={[
          {
            title: "Tell us your route and ticket",
            body: "Pick your Stockholm route and add your SL ticket. Sixty seconds, then done forever.",
          },
          {
            title: "We watch every departure",
            body: "Our bots check Trafiklab every minute. When your tunnelbana car arrives late enough to claim, we have proof, time-stamped, ready to file.",
          },
          {
            title: "We file. Money lands in your bank.",
            body: (
              <>
                Our autofill bot submits the SL claim with your details. The 100&nbsp;KR
                shows up shortly after.
              </>
            ),
          },
        ]}
      />

      <TrustBand
        title={<>SL claims, <em>already paid back.</em></>}
        lead="Real numbers from real Stockholm commuters. Updated monthly."
        stats={[
          { value: "612,000 KR", label: "Refunded to Stockholm commuters since launch" },
          { value: "6,140", label: "Tunnelbana and Pendeltåg delays filed for our users" },
          { value: "96%", label: "Claims approved by SL on first submission" },
        ]}
        quoteText={
          <>
            "Half my Tunnelbana commutes are late, the other half are just barely on time. I get
            refunded for the late ones without ever opening the SL app."
          </>
        }
        quoteAuthor="Andreas, daily commuter, T-Centralen → Mariatorget"
      />

      <Signup
        scene={<SLSignup />}
        title={<>Stockholm is <em>coming next.</em></>}
        lead={
          <>
            SL support is in the works. In the meantime, our Skånetrafiken service is live and
            already filing claims for daily commuters.
          </>
        }
        small="Free during beta. SL launching soon."
        cta={
          <Link to="/app" className="cmt-btn cmt-btn--lg">
            Try the Skånetrafiken service
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        }
      />

      <Footer regionLabel="Stockholm" />

      <TravellingVehicle vehicle={<SLVehicle />} />
    </>
  );
}
