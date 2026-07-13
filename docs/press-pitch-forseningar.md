# Press-pitch: "Sommarens mest försenade tågstationer" (utkast)

**Syfte (internt):** tjäna omnämnanden + länkar till qvitta.nu/forseningar — SEO-lever #1
(länkauktoritet är gapet mot Klimra, inte innehåll). Varje publicering = en länk + ett
varumärkesomnämnande. Datat är vår vallgrav: ingen annan publicerar stations­nivåstatistik
per dag från Trafikverkets realtidsdata.

**Innan utskick:**
1. Uppdatera siffrorna — kör `scripts/refresh_station_stats.py` + committa så att
   `/forseningar`-sidorna visar samma period som pitchen (journalister klickar och räknar).
   Siffrorna nedan avser **3–11 juli 2026** (9 dagar, live-fråga mot `agg_station_delays_daily`).
2. Skicka från `kontakt@qvitta.nu` (forwardern finns; svar landar hos Arian).
3. En journalist i taget per tidning, kort mejl, datat som bilaga/länk — inte massutskick.

---

## Ämnesrader (välj per mottagare)

- Vart tionde tåg genom Småland minst 20 minuter sent i juli — här är stationerna
- Ny statistik: sommarens banarbeten slår hårdast mot dessa stationer
- 9 900 ersättningsgrundande tågförseningar på nio dagar — de flesta ansöker aldrig

## Pitch (brödtext, anpassa per region)

Hej [namn],

Vi bevakar varje tågavgång från 443 svenska stationer i realtid med Trafikverkets data.
Under de första nio dagarna av juli (3–11 juli) såg vi:

- **347 600 avgångar**, varav **44 500 minst 5 minuter försenade** och
  **9 911 minst 20 minuter försenade** — den gräns där resenärer i regel har rätt
  till 50–100 % av biljettpriset tillbaka.
- **6 717 inställda avgångar.**
- Sommarens banarbeten på Södra stambanan syns tydligt: på sträckan
  **Nässjö–Alvesta** var **var tionde avgång minst 20 minuter sen** —
  Stockaryd (10,9 %), Lammhult (10,2 %), Sävsjö (10,0 %), Bodafors (10,0 %),
  Moheda (9,9 %). Största uppmätta försening: **3 h 42 min** (Nässjö C).
- I Värmland: Kil 10,1 % och Karlstad C 7,7 % av avgångarna minst 20 min sena.
- I Skåne är volymen störst: pendlarstationerna Burlöv, Åkarp, Hjärup,
  Klostergården och Lund C hade **~180 ersättningsgrundande förseningar var**
  på nio dagar; Lund C dessutom 91 inställda avgångar.

Nästan ingen av dessa förseningar leder till en ansökan — trots att rätten till
ersättning är lagstadgad (lagen om kollektivtrafikresenärers rättigheter, 2015:953)
och fristerna korta (oftast två månader).

Statistiken per station är öppen: https://qvitta.nu/forseningar
Vi tar gärna fram siffror för [er region/sträcka] — per station, per dag.

[Kort om Qvitta: gratis tjänst som bevakar tågtrafiken i realtid och hjälper
resenärer ansöka om ersättningen de har rätt till. Pengarna går direkt från
operatören till resenären.]

Vänliga hälsningar,
Arian Fakhravar, Qvitta — kontakt@qvitta.nu

## Regionala vinklar → mottagare

| Vinkel | Stationer/data | Tidningar |
|---|---|---|
| Banarbetena genom Småland | Nässjö, Sävsjö, Stockaryd, Bodafors, Lammhult, Moheda, Alvesta, Älmhult, Diö | Smålands-Tidningen, Smålandsposten, Jönköpings-Posten, Barometern |
| Skånska pendlarbältet | Burlöv, Åkarp, Hjärup, Klostergården, Lund C, Eslöv (6,0 % ≥20 min), Hästveda | Sydsvenskan, HD, Skånska Dagbladet, Norra Skåne |
| Värmland | Kil (10,1 %), Karlstad C (7,7 %) | NWT, Värmlands Folkblad |
| Stockholmspendeln (volym) | Älvsjö/Stockholms S/Årstaberg ~110 ersättningsgrundande var | Mitti, StockholmDirekt |
| Riks: "miljoner i oanvänd ersättning" | Nätverkssiffrorna ovan | SVT Nyheter, TT, Dagens Nyheter, Breakit (tech-vinkel) |

## Metodnot (bifoga alltid)

Statistiken bygger på Trafikverkets öppna realtidsdata (uppmätta ankomst-/avgångstider
vid spår), inte tidtabellsprognoser. En avgång räknas som försenad ≥ 20 minuter när den
faktiska tiden avvek minst 20 minuter från den annonserade. Perioden avser 3–11 juli 2026;
statistiken uppdateras löpande på qvitta.nu/forseningar. Andelar beräknas mot uppmätta
avgångar. Qvitta är oberoende av tågoperatörerna.

## Uppföljning (repeterbar nyhetskrok)

Gör detta till en **månadsrapport** ("Månadens mest försenade stationer") — samma mall,
färska siffror, första veckan varje månad. Journalister som nappat en gång prenumererar
i praktiken. Agg-tabellen ackumulerar (400 d cap), så fönstret växer till hela månader
av sig självt.
