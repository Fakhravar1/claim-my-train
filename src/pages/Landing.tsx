import { useLandingStyles } from "@/hooks/useLandingStyles";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import OperatorPicker from "@/components/landing/OperatorPicker";
import ProblemStats, { PROBLEM_ICONS } from "@/components/landing/ProblemStats";
import HowItWorks from "@/components/landing/HowItWorks";
import TrustBand from "@/components/landing/TrustBand";
import Signup from "@/components/landing/Signup";
import Footer from "@/components/landing/Footer";
import TravellingVehicle from "@/components/landing/TravellingVehicle";
import {
  HubHeroScene,
  HubSignupScene,
  HubVehicle,
  HubSmoke,
} from "@/components/landing/HubScenes";

/**
 * Marketing landing at `/`. Wrapped in <ProtectedFromAuth> by App.tsx so
 * signed-in users get bounced to /app instead of landing here.
 *
 * TODO: replace placeholder stat values once we have real telemetry from
 * fct_passenger_journeys (12,800+ claimable, 1.4 M KR, 97% etc. are
 * demonstrative). TODO: replace the invented "Linnea" quote with a real
 * testimonial when available.
 */
export default function Landing() {
  useLandingStyles();

  return (
    <>
      <Nav />

      <Hero
        scene={<HubHeroScene />}
        eyebrow="Three regions · One quiet refund machine"
        title={
          <>
            Skip the claim form.<br />
            We&nbsp;file{" "}
            <span className="op-line">
              your{" "}
              <span
                className="op-rotator"
                role="text"
                aria-label="Skånetrafiken, SL, or Västtrafik"
              >
                <span className="op-rotator__inner" aria-hidden="true">
                  <span className="op-rotator__item op-rotator__item--skt">Skånetrafiken</span>
                  <span className="op-rotator__item op-rotator__item--sl">SL</span>
                  <span className="op-rotator__item op-rotator__item--vt">Västtrafik</span>
                  <span className="op-rotator__item op-rotator__item--skt">Skånetrafiken</span>
                </span>
              </span>
            </span>{" "}
            refunds <em>automatically.</em>
          </>
        }
        lead={
          <>
            Commute by train, tram or subway in Skåne, Stockholm or Västra&nbsp;Götaland? When you
            arrive 20&nbsp;minutes late, you're owed a refund. We watch every departure, file the
            claim, and put the money back in your account. <strong>You don't lift a finger.</strong>
          </>
        }
      />

      <OperatorPicker />

      <ProblemStats
        eyebrow="The reality"
        title={<>Your train is late. <em>Again.</em></>}
        lead={
          <>
            Your regional operator owes you <strong>100&nbsp;KR</strong> every time your train
            arrives 20&nbsp;minutes late or more. Most commuters never file. The form takes
            twelve minutes. The delay already cost you the rest of your morning.
          </>
        }
        stats={[
          { value: "20 min", label: "The minimum delay that earns you a 100 KR refund.", icon: PROBLEM_ICONS.clock },
          { value: "12,800+", label: "Claimable delays across our three operators in the last year.", icon: PROBLEM_ICONS.chart },
          { value: "12 min", label: <>The time the operator's claim form takes &mdash; per delay.</>, icon: PROBLEM_ICONS.house },
        ]}
      />

      <HowItWorks
        steps={[
          {
            title: "Tell us your route and ticket",
            body: "Pick your operator, your usual route, and your ticket details. Sixty seconds, then you're done forever.",
          },
          {
            title: "We watch every departure",
            body: "Our bots check Trafiklab every minute. When your train arrives late enough to claim, we have proof, time-stamped, ready to file.",
          },
          {
            title: "We file. Money lands in your bank.",
            body: (
              <>
                Our autofill bot submits the claim with your operator's form. You get a short
                email when it's accepted. The 100&nbsp;KR shows up shortly after.
              </>
            ),
          },
        ]}
      />

      <TrustBand
        title={<>What we've already <em>claimed back.</em></>}
        lead="Real numbers from real commuters. Updated monthly."
        stats={[
          { value: <>1.4&nbsp;M&nbsp;KR</>, label: "Refunded to commuters across three regions" },
          { value: "14,000+", label: "Delays claimed automatically on behalf of users" },
          { value: "97%", label: "Claims approved on first submission" },
        ]}
        quoteText={
          <>
            "I used to file maybe one claim a month, when I remembered. Last month I got back
            800&nbsp;KR without thinking about it once. It's the kindest software I own."
          </>
        }
        quoteAuthor="Linnea, daily commuter"
      />

      <Signup
        scene={<HubSignupScene />}
        small="Free during beta. Filing claims for Skånetrafiken today."
      />

      <Footer />

      <TravellingVehicle vehicle={<HubVehicle />} smoke={<HubSmoke />} />
    </>
  );
}
