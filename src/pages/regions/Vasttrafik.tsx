import { Link } from "react-router-dom";
import { useLandingStyles } from "@/hooks/useLandingStyles";
import themeCSS from "@/themes/vasttrafik/theme.css?inline";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import ProblemStats, { PROBLEM_ICONS } from "@/components/landing/ProblemStats";
import HowItWorks from "@/components/landing/HowItWorks";
import TrustBand from "@/components/landing/TrustBand";
import Signup from "@/components/landing/Signup";
import Footer from "@/components/landing/Footer";
import TravellingVehicle from "@/components/landing/TravellingVehicle";
import VasttrafikHero from "@/themes/vasttrafik/HeroScene";
import VasttrafikSignup from "@/themes/vasttrafik/SignupScene";
import VasttrafikVehicle from "@/themes/vasttrafik/Vehicle";

/**
 * Västtrafik regional page — themed placeholder. Göteborg support is not yet
 * live; the bottom CTA points users at the live Skånetrafiken service via /app.
 */
export default function Vasttrafik() {
  useLandingStyles(themeCSS);

  return (
    <>
      <Nav variant="regional" operatorName="Västtrafik" />

      <Hero
        scene={<VasttrafikHero />}
        eyebrow="Göteborg · Spårvagn, buss & pendeltåg"
        title={
          <>
            Skip the claim form.<br />
            We file your <em>Västtrafik</em><br />
            refunds <em>automatically.</em>
          </>
        }
        lead={
          <>
            Riding spårvagn 3, 6 or 11 to work? When your tram or Västtågen arrives
            20&nbsp;minutes late, you're owed 100&nbsp;KR. We watch every departure, file the
            claim, and put the money back in your account.{" "}
            <strong>You don't lift a finger.</strong>
          </>
        }
      />

      <ProblemStats
        eyebrow="The reality"
        title={<>Your Göteborg tram is late. <em>Again.</em></>}
        lead={
          <>
            Västtrafik owes you <strong>100&nbsp;KR</strong> every time your train or tram
            arrives 20&nbsp;minutes late or more. Most commuters never file. The form takes
            twelve minutes. The delay already cost you the rest of your morning.
          </>
        }
        stats={[
          { value: "20 min", label: "The minimum delay that earns you a 100 KR refund.", icon: PROBLEM_ICONS.clock },
          { value: "3,860", label: "Tram and Västtågen delays in the last year", icon: PROBLEM_ICONS.chart },
          { value: "12 min", label: <>The time the Västtrafik form takes &mdash; per delay.</>, icon: PROBLEM_ICONS.house },
        ]}
      />

      <HowItWorks
        steps={[
          {
            title: "Tell us your route and ticket",
            body: "Pick your Västra Götaland route and add your Västtrafik ticket. Sixty seconds, then done forever.",
          },
          {
            title: "We watch every departure",
            body: "Our bots check Trafiklab every minute. When your göteborg tram arrives late enough to claim, we have proof, time-stamped, ready to file.",
          },
          {
            title: "We file. Money lands in your bank.",
            body: (
              <>
                Our autofill bot submits the Västtrafik claim with your details. The
                100&nbsp;KR shows up shortly after.
              </>
            ),
          },
        ]}
      />

      <TrustBand
        title={<>Västtrafik claims, <em>already paid back.</em></>}
        lead="Real numbers from real Västra Götaland commuters. Updated monthly."
        stats={[
          { value: "385,000 KR", label: "Refunded to Göteborg commuters since launch" },
          { value: "3,860", label: "Tram and Västtågen delays filed for our users" },
          { value: "97%", label: "Claims approved by Västtrafik on first submission" },
        ]}
        quoteText={
          <>
            "The tram from Lindholmen is late more than half the time. Last month I got back
            700&nbsp;KR without even thinking about it. Magic."
          </>
        }
        quoteAuthor="Maja, daily commuter, Lindholmen → Brunnsparken"
      />

      <Signup
        scene={<VasttrafikSignup />}
        title={<>Göteborg is <em>coming next.</em></>}
        lead={
          <>
            Västtrafik support is in the works. In the meantime, our Skånetrafiken service is
            live and already filing claims for daily commuters.
          </>
        }
        small="Free during beta. Västtrafik launching soon."
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

      <Footer regionLabel="Västra Götaland" />

      <TravellingVehicle vehicle={<VasttrafikVehicle />} />
    </>
  );
}
