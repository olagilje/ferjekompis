# Ferjekompis v2

Ferjekompis viser kommande ferjeavgangar frå Entur og reknar ut ei rettleiande vegtid til kaia. Appen er ei PWA som kan leggjast til på startskjermen på mobil.

## Dette kan appen

- Finne ferjer nær GPS-posisjonen eller eit valt punkt på kartet.
- Søkje etter ei bestemt ferjekai i Entur og vise avgangar derfrå, også utan GPS.
- Bytte kai/retning innanfor eit samband.
- Vise registrerte samband med fleire kaier som eitt kort, med val av avreisekai og reisemål. Avgangane blir filtrerte etter stoppemønsteret til ferja i Entur.
- Vise rutetid, sanntidsinformasjon når Entur har det, og kansellerte avgangar.
- Rekne ut kva avgang som kan vere aktuell med vald sikkerheitsmargin (5 minutt som standard).
- I automatisk nærvising ligg samband med over 90 minutt estimert køyretid under «Vis også …»; eit manuelt søk på kai viser alle funne samband direkte.
- Opne Entur med bussreise til vald ferjekai; Entur-appen/nettsida handterer kollektivruta.
- Hente avgangar frå ein Netlify Function, slik at Entur-nøkkelen ikkje trengst i nettlesaren.

## Viktige avgrensingar

- Avgangane kjem frå Entur Journey Planner v3. Appen viser berre linjer som ligg i den vedlikehaldne lista i `netlify/functions/road-ferries.json`. Samband som ikkje finst i lista kan derfor mangle.
- Vegtid prøver Statens vegvesen sin Ruteplanleggar først når tilgang er sett opp, og fell tilbake til OSRM dersom tilgang manglar, Vegvesen svarar med feil, eller dagsgrensa er nådd. Appen tel rutekall felles på serversida og stoppar ved 2 500 per norsk kalenderdag. Teljaren brukar Netlify Blobs. Køyretida er rettleiande og tek ikkje høgde for kø, oppstilling eller innsjekkfristar.
- Entur sine data kan vere ufullstendige eller endrast. Kontroller alltid avgangen og ferjeselskapet sine krav.
- Filter for store og små ferjer er ikkje implementert; det krev ei påliteleg kjelde for ferjene sin kapasitet. Vegnummer og sorteringsprioritet seier ikkje kor stor båten er.
- GPS-posisjonen blir sendt via Netlify-funksjonen for å finne kaier; vegberekninga sender posisjonen og kaia til Statens vegvesen dersom tilgang er sett opp, elles til OSRM. Appen lagrar ikkje posisjonen i ein brukarkonto.
- Entur-lenka inneheld ID-en til den valde ferjekaia, men ikkje GPS-posisjonen. Entur kan bruke si eiga posisjonstilgang som startpunkt.
- Nett trengst for ferske data. Service worker lagrar berre appskalet; kartfliser og avgangar er ikkje tilgjengelege offline.

## Netlify-oppsett

Netlify byggjer frå rotmappa. `netlify.toml` peikar på `netlify/functions` og konfigurerer funksjonspakkinga. GitHub-kopling er den enklaste måten å publisere på.

Set gjerne `ENTUR_CLIENT_NAME` som Netlify-miljøvariabel til ein identifikator i formatet `organisasjon-app`, med små bokstavar og bindestrek. Koden brukar `ferjekompis-web` dersom variabelen ikkje er sett. Entur krev at API-kall identifiserer klientappen.

For Vegvesen-ruting: be Statens vegvesen om API-tilgang, og legg brukarnamnet og passordet inn i Netlify som hemmelege miljøvariablar `SVV_ROUTING_USERNAME` og `SVV_ROUTING_PASSWORD`. Appen brukar maksimalt 2 500 rutekall per norsk kalenderdag og går automatisk over til OSRM når dagsgrensa er nådd. Statens vegvesen skal oppgivast som kjelde når Vegvesen-data blir brukte. OSRM si offentlege demoteneste er meint for prototyping, så dette er ei reserveordning og ikkje ein garantert produksjonsteneste.

## Lokal køyring

Vanleg statisk filserver køyrer ikkje Netlify-funksjonane. Med Node.js og Netlify CLI:

```sh
npm install -g netlify-cli
netlify dev
```

Opne adressa Netlify CLI viser. Appen kallar `/.netlify/functions/ferjer`.

## Filer

- `index.html` — grensesnitt, kart, søk og anbefalingsvising.
- `netlify/functions/ferjer.mjs` — Entur-, Statens vegvesen- og OSRM-kall.
- `netlify/functions/road-ferries.json` — godkjende ferjelinjer og sorteringsprioritet.
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA-oppsett.

## Referansar

- [Entur Journey Planner](https://developer.entur.no/docs/open-services/journey-planner)
- [Entur stopPlacesByBbox](https://developer.entur.no/apis/graphql/journey-planner/query/stopPlacesByBbox)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [Statens vegvesen: Ruteplan API](https://www.vegvesen.no/ws/no/vegvesen/ruteplan/routingservice_v3_0/open/routingService/openapi/index.html)
- [Dataportalen: tilgang og dagsgrense for Ruteplanleggar](https://dataut.vegvesen.no/dataservice/ruteplanlegger-for-bil-og-tungbil)
