# Ferjekompis – Entur-integrasjon, versjon 2 (test)

Denne utgaven viderefører opprinnelig design fra prototypen. **Det finnes ingen oppdiktede ferjeavganger i denne versjonen.** Nettsiden henter avgangstider fra Entur Journey Planner v3 via en Netlify Function.

## Dette er implementert
- GPS i iPhone/Safari på HTTPS, mobilkart, flere ferjekaier i nærheten.
- Entur `stopPlacesByBbox` for søk etter ferjekaier i et geografisk område, filtrert på vanntransport, sortert etter luftlinjeavstand.
- Entur `estimatedCalls` for faktiske rutetider, sanntidsflagg og innstillinger.
- Kjøretid via OSRM **offentlig demoserver** (kun utvikling/testing). **Ikke produksjonsklar**, kapasitet, begrensninger og dekningsgrad kan variere.
- Anbefalt avgang hvis kjøreruten kan beregnes, med 5/10/15/20 minutter margin. Forrige avgang man ikke rekker markeres grått med rød overstryking.
- Manuelt tekstfilter på ferjekaier innenfor søkeområdet (ikke globalt sambandssøk).
- Ingen simulering ved feil: Appen viser en feilmelding hvis ekte data ikke er tilgjengelige.

## Kjente begrensninger — LES DETTE
- **Integrasjonen er ikke kjørt mot Enturs server i dette utviklingsmiljøet** (nettverk er blokkert). GraphQL-oppsettet er basert på publisert API-dokumentasjon. Produksjonstest på Netlify gjenstår.
- OSRM gir bare en veiledende rutetid for bil. Det kan velge feil ankomstpunkt, og det tar ikke hensyn til kø, vær, innsjekk, oppstillingsfelt, eller ferjeselskapets frister. Ingen avganger er garantert å kunne nås.
- For biltransport må det senere verifiseres at avgangen er en bilferje (Enturs `water` inkluderer også passasjerbåter). **Ikke anta at «ANBEFALT» betyr at bilen kan tas med** i denne testutgaven.
- Bussknappen finnes, men bussberegning er ikke implementert og viser en tydelig begrensning.
- «Velg annet samband» filtrerer foreløpig bare nærliggende ferjekaier etter navn. Søket omfatter ikke hele Norge.
- Kun et utvalg av nærmeste ferjekaier og kommende avganger vises. Ingen garantier om at alle aktuelle samband vises.
- En tidlig avgang som ikke rekker kan fortsatt vises hvis avgangen er hentet fra Entur (75 min tilbake). Historiske avganger eldre enn dette vises ikke.
- PWA må ha nettforbindelse for ferske data. Offline-cache er bare for appskallet.

## Publiser på Netlify — enkleste oppsett
1. Opprett en gratis Netlify-konto på https://app.netlify.com/.
2. Pakk ut ZIP-filen. For at Functions skal distribueres korrekt, anbefales Netlify med et **GitHub-repository** for prosjektmappen. Last opp alle filene i prosjektmappen, inkludert `netlify.toml` og `netlify/functions/ferjer.mjs`.
3. I Netlify: **Add new project → Import an existing project → GitHub**. Velg repository. Byggekommando kan stå tom, publiseringsmappe er `.`.
4. Under **Site configuration → Environment variables**, legg gjerne til `ENTUR_CLIENT_NAME` med en entydig verdi, f.eks. `dittfirma-ferjekompis` (små bokstaver, ingen mellomrom). Standard er `ferjekompis-web` under test.
5. Deploy. Åpne HTTPS-adressen på iPhone i Safari og tillat posisjon. Test på konkrete ferjekaier i Vestland mot https://entur.no og ferjeoperatørens informasjon.
6. Safari: Del → Legg til på Hjem-skjerm.

## Lokalt utviklingsmiljø
Vanlig `python -m http.server` kjører **ikke** Netlify Functions. Du trenger Node.js og Netlify CLI:

```
npm install -g netlify-cli
netlify dev
```

Åpne adressen som Netlify CLI oppgir. Appen forutsetter `/ .netlify/functions/ferjer` (uten mellomrom). Et vanlig statisk filhotell vil ikke kunne kjøre backend-funksjonen.

## Neste steg før praktisk bruk
1. Live-test Entur-spørringene, og korriger eventuelle API/schema-ulikheter.
2. Verifiser at funn er **bilferjer** (ikke passasjerbåter) med transportSubmode/linjedata.
3. Bytt OSRM-demo med en driftssikker rutetjeneste og kontroller ankomstpunkt for bil.
4. Håndter kø og innsjekkfrister, inkludert ferjespesifikke regler.
5. Implementer bussreise med gangtid og Entur reiseplanlegger.
6. Test ferjer og retninger, innstillinger, sanntid og sikkerhet før appen brukes til tidskritiske reiser.

**Kilder:** https://developer.entur.no/docs/open-services/journey-planner og https://developer.entur.no/apis/graphql/journey-planner/query/stopPlacesByBbox
