/**
 * FAQ content — single source for the React page (src/pages/FAQ.tsx) and the
 * build-time prerender (scripts/prerenderGuides.ts). Dependency-free: it is
 * imported by vite.config.ts (esbuild, Node) at build time.
 */

export type FaqItem = { q: string; a: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Vad är Qvitta?",
    a: "Qvitta är en tjänst som hjälper dig att få ersättning när ditt tåg är försenat eller inställt. Vi bevakar trafiken i realtid, upptäcker förseningar som ger rätt till ersättning och hjälper dig att skicka in ansökan hos operatören.",
  },
  {
    q: "Hur fungerar det?",
    a: "Sök fram din sträcka och datum så visar vi vilka avgångar som var försenade eller inställda. När du hittar din resa klickar du på \"Ansök om ersättning\" och fyller i dina uppgifter — vi sköter resten åt dig.",
  },
  {
    q: "Hur mycket ersättning kan jag få?",
    a: "Det beror på operatören och hur lång förseningen var. För Skånetrafiken gäller 50 % vid 20–39 minuter, 75 % vid 40–59 minuter och 100 % vid 60 minuter eller mer. För SJ och längre sträckor gäller andra regler enligt EU-förordning 2021/782.",
  },
  {
    q: "Vilka operatörer stöds?",
    a: "Vi stöder för närvarande Skånetrafiken, Öresundståg, SJ, Vy, Kalmar länstrafik, SL och Västtrafik. Vissa operatörer hanteras direkt i appen och andra vidarekopplar vi till deras egna formulär.",
  },
  {
    q: "Kostar det något?",
    a: "Nej, Qvitta är helt gratis att använda. Ersättningen betalas ut direkt från operatören till dig — pengarna passerar aldrig oss.",
  },
  {
    q: "Vad behöver jag för information?",
    a: "Du behöver veta vilken sträcka du reste och ungefär vilken tid. Om du kommer ihåg avgångstiden hjälper det oss att hitta rätt tåg. Du behöver också fylla i dina kontakt- och utbetalningsuppgifter en gång i Inställningar.",
  },
  {
    q: "Hur lång tid tar det att få ersättning?",
    a: "Det varierar mellan operatörer. Skånetrafiken behandlar vanligtvis ärenden inom några veckor. När din ansökan är skickad kan du följa statusen under Inställningar → Mina ärenden.",
  },
  {
    q: "Behöver jag spara min biljett?",
    a: "Ja, det är bra att spara din biljett eller bokningsbekräftelse som kvitto på att du reste. Vissa operatörer begär biljettnummer vid ansökan.",
  },
  {
    q: "Hur vet ni att mitt tåg verkligen var försenat?",
    a: "Vi använder officiell trafikdata från Trafikverket och Trafiklab i realtid. Informationen uppdateras löpande så att vi kan matcha din resa mot de faktiska avgångs- och ankomsttiderna.",
  },
  {
    q: "Vad händer med mina personuppgifter?",
    a: "Dina uppgifter lagras säkert och används enbart för att skicka in din ersättningsansökan. Vi delar dem endast med den operatör du ansöker hos. Läs mer i vår integritetspolicy på qvitta.nu/integritet — där ser du också hur du exporterar eller raderar dina uppgifter.",
  },
];

/** schema.org FAQPage markup — derived from FAQ_ITEMS so it can never drift. */
export function faqPageJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "sv",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
