# Ferjekompis – første prototype

Dette er en tidlig, mobiltilpasset PWA-prototype for iPhone.

## Innhold som fungerer
- Mobilvennlig grensesnitt.
- GPS-posisjon via nettleseren (krever HTTPS og at brukeren gir tillatelse).
- Kart med posisjonsmarkør (Leaflet + OpenStreetMap).
- Bytte mellom Bil og Buss.
- Valg av sikkerhetsmargin.
- Manuell overstyring ved å skrive inn et samband/ferjekai.
- Visuell avgangsliste med rød gjennomstreking for en tidligere avgang og grønn anbefalt avgang.

## Viktig begrensning
Avgangene i denne prototypen er **kun eksempeldata**. Den kobler seg foreløpig ikke til Entur eller en rutetjeneste, og beregner ikke faktisk kjøretid. Ikke bruk den til å rekke en reell ferje.

## Neste utviklingssteg
1. Koble til Entur Journey Planner v3 for stoppesteder, rutetider og sanntidsdata.
2. Identifisere ferjekaier og relevante ferjelinjer i nærheten av GPS-posisjonen.
3. Legge til ruteberegning for bil (egen rutetjeneste).
4. Beregne hvilke avganger som kan nås med sikkerhetsmargin.
5. Legge til buss som et alternativ via Entur.
6. Teste med faktiske samband i Vestland.

## Entur
Journey Planner v3:
https://developer.entur.no/docs/open-services/journey-planner

API:
https://api.entur.io/journey-planner/v3/graphql

Entur krever `ET-Client-Name`-header på API-kall. I en produksjonsløsning bør API-kall gå via en liten backend/proxy slik at identifikasjon og eventuelle nøkler ikke ligger eksponert i klienten.

## Kjør lokalt
PWA-funksjoner og GPS krever HTTPS eller localhost. For rask lokal test kan du bruke en enkel lokal webserver fra prosjektmappen, for eksempel:
`python3 -m http.server 8000`
Åpne deretter `http://localhost:8000`.

For å installere på iPhone må prosjektet publiseres på en HTTPS-adresse. Åpne adressen i Safari → Del → Legg til på Hjem-skjerm.
