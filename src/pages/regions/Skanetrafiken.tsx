import { useLandingStyles } from "@/hooks/useLandingStyles";
import themeCSS from "@/themes/skanetrafiken/theme.css?inline";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import ProblemStats, { PROBLEM_ICONS } from "@/components/landing/ProblemStats";
import HowItWorks from "@/components/landing/HowItWorks";
import TrustBand from "@/components/landing/TrustBand";
import Signup from "@/components/landing/Signup";
import Footer from "@/components/landing/Footer";
import TravellingVehicle from "@/components/landing/TravellingVehicle";
import SkanetrafikenHero from "@/themes/skanetrafiken/HeroScene";
import SkanetrafikenSignup from "@/themes/skanetrafiken/SignupScene";
import SkanetrafikenVehicle from "@/themes/skanetrafiken/Vehicle";

/** Skånetrafiken regional page — the only live operator today. */
export default function Skanetrafiken() {
  useLandingStyles(themeCSS);

  return (
    <>
      <Nav variant="regional" operatorName="Skånetrafiken" />

      <Hero
        scene={<SkanetrafikenHero />}
        eyebrow="Skåne · Pågatåg & Öresundståg"
        title={
          <>
            Skip the claim form.<br />
            We file your <em>Skånetrafiken</em><br />
            refunds <em>automatically.</em>
          </>
        }
        lead={
          <>
            Commuting between Hässleholm, Lund, Helsingborg or Malmö? When your Pågatåg or
            Öresundståg arrives 20&nbsp;minutes late, you're owed 100&nbsp;KR. We watch every
            departure, file the claim, and put the money back in your account.{" "}
            <strong>You don't lift a finger.</strong>
          </>
        }
      />

      <ProblemStats
        eyebrow="The reality"
        title={<>Your Pågatåg is late. <em>Again.</em></>}
        lead={
          <>
            Skånetrafiken owes you <strong>100&nbsp;KR</strong> every time your train or tram
            arrives 20&nbsp;minutes late or more. Most commuters never file. The form takes
            twelve minutes. The delay already cost you the rest of your morning.
          </>
        }
        stats={[
          { value: "20 min", label: "The minimum delay that earns you a 100 KR refund.", icon: PROBLEM_ICONS.clock },
          { value: "4,280", label: "Pågatåg and Öresundståg delays in the last year", icon: PROBLEM_ICONS.chart },
          { value: "12 min", label: <>The time the Skånetrafiken form takes &mdash; per delay.</>, icon: PROBLEM_ICONS.house },
        ]}
      />

      <HowItWorks
        steps={[
          {
            title: "Tell us your route and ticket",
            body: "Pick your Skåne route and add your Skånetrafiken ticket. Sixty seconds, then done forever.",
          },
          {
            title: "We watch every departure",
            body: "Our bots check Trafiklab every minute. When your pågatåg arrives late enough to claim, we have proof, time-stamped, ready to file.",
          },
          {
            title: "We file. Money lands in your bank.",
            body: (
              <>
                Our autofill bot submits the Skånetrafiken claim with your details. The
                100&nbsp;KR shows up shortly after.
              </>
            ),
          },
        ]}
      />

      <TrustBand
        title={<>Skånetrafiken claims, <em>already paid back.</em></>}
        lead="Real numbers from real Skåne commuters. Updated monthly."
        stats={[
          { value: "428,000 KR", label: "Refunded to Skåne commuters since launch" },
          { value: "4,280", label: "Pågatåg and Öresundståg delays filed for our users" },
          { value: "97%", label: "Claims approved by Skånetrafiken on first submission" },
        ]}
        quoteText={
          <>
            "My morning Pågatåg used to ruin my morning. Now Skånetrafiken just refunds me
            before I notice. It's the kindest software I own."
          </>
        }
        quoteAuthor="Linnea, daily commuter, Lund → Malmö C"
      />

      <Signup
        scene={<SkanetrafikenSignup />}
        small="Free during beta. Filing claims for Skånetrafiken today."
      />

      <Footer regionLabel="Skåne" />

      <TravellingVehicle vehicle={<SkanetrafikenVehicle />} />
    </>
  );
}
