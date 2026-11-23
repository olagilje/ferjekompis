# Ferjekompis v2

Ferjekompis viser kommande ferjeavgangar frå Entur og reknar ut ei rettleiande vegtid til kaia. Appen er ei PWA som kan leggjast til på startskjermen på mobil.

## Dette kan appen

- Finne ferjer nær GPS-posisjonen eller eit valt punkt på kartet.
- Søkje etter ei bestemt ferjekai i Entur og vise avgangar derfrå, også utan GPS.
- Bytte kai/retning innanfor eit samband.
- Vise trekantsambandet Rv. 13 Vangsnes–Hella–Dragsvik som eitt kort med val av både avreisekai og reisemål, og avgangar filtrerte etter stoppemønsteret til ferja.
- Vise rutetid, sanntidsinformasjon når Entur har det, og kansellerte avgangar.
- Rekne ut kva avgang som kan vere aktuell med vald sikkerheitsmargin (5 minutt som standard).
- I automatisk nærvising ligg samband med over 90 minutt estimert køyretid under «Vis også …»; eit manuelt søk på kai viser alle funne samband direkte.
- Opne Entur med bussreise til vald ferjekai; Entur-appen/nettsida handterer kollektivruta.
- Hente avgangar frå ein Netlify Function, slik at Entur-nøkkelen ikkje trengst i nettlesaren.

## Viktige avgrensingar

- Avgangane kjem frå Entur Journey Planner v3. Appen viser berre linjer som ligg i den vedlikehaldne lista i `netlify/functions/road-ferries.json`. Samband som ikkje finst i lista kan derfor mangle.
- Vegtid kjem frå den offentlege OSRM-testserveren. Dette er berre rettleiande, kan vere feil og tek ikkje høgde for kø, oppstilling eller innsjekkfristar. Han bør bytast ut før appen blir brukt som grunnlag for tidskritiske reiser.
- Entur sine data kan vere ufullstendige eller endrast. Kontroller alltid avgangen og ferjeselskapet sine krav.
- Filter for store og små ferjer er ikkje implementert; det krev ei påliteleg kjelde for ferjene sin kapasitet. Vegnummer og sorteringsprioritet seier ikkje kor stor båten er.
- GPS-posisjonen blir sendt via Netlify-funksjonen for å finne kaier; vegberekninga sender posisjonen og kaia til OSRM. Appen lagrar ikkje posisjonen i ein brukarkonto.
- Entur-lenka inneheld ID-en til den valde ferjekaia, men ikkje GPS-posisjonen. Entur kan bruke si eiga posisjonstilgang som startpunkt.
- Nett trengst for ferske data. Service worker lagrar berre appskalet; kartfliser og avgangar er ikkje tilgjengelege offline.

## Netlify-oppsett

Netlify byggjer frå rotmappa. `netlify.toml` peikar på `netlify/functions` og konfigurerer funksjonspakkinga. GitHub-kopling er den enklaste måten å publisere på.

Set gjerne `ENTUR_CLIENT_NAME` som Netlify-miljøvariabel til ein identifikator i formatet `organisasjon-app`, med små bokstavar og bindestrek. Koden brukar `ferjekompis-web` dersom variabelen ikkje er sett. Entur krev at API-kall identifiserer klientappen.

## Lokal køyring

Vanleg statisk filserver køyrer ikkje Netlify-funksjonane. Med Node.js og Netlify CLI:

```sh
npm install -g netlify-cli
netlify dev
```

Opne adressa Netlify CLI viser. Appen kallar `/.netlify/functions/ferjer`.

## Filer

- `index.html` — grensesnitt, kart, søk og anbefalingsvising.
- `netlify/functions/ferjer.mjs` — Entur- og OSRM-kall.
- `netlify/functions/road-ferries.json` — godkjende ferjelinjer og sorteringsprioritet.
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA-oppsett.

## Referansar

- [Entur Journey Planner](https://developer.entur.no/docs/open-services/journey-planner)
- [Entur stopPlacesByBbox](https://developer.entur.no/apis/graphql/journey-planner/query/stopPlacesByBbox)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
