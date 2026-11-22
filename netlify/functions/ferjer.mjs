import roadFerries from './road-ferries.json' with { type: 'json' };
const API = 'https://api.entur.io/journey-planner/v3/graphql';
const CLIENT = process.env.ENTUR_CLIENT_NAME || 'ferjekompis-web';
const HEADERS = { 'content-type': 'application/json', 'ET-Client-Name': CLIENT };
const Q_STOPS = `query($a:Float!,$b:Float!,$c:Float!,$d:Float!){stopPlacesByBbox(minimumLatitude:$a,minimumLongitude:$b,maximumLatitude:$c,maximumLongitude:$d,filterByInUse:true){id name latitude longitude transportMode transportSubmode}}`;
const Q_CALLS = `query($ids:[String],$start:DateTime){stopPlaces(ids:$ids){id name latitude longitude estimatedCalls(startTime:$start,timeRange:43200,numberOfDepartures:45,includeCancelledTrips:true){aimedDepartureTime expectedDepartureTime realtime cancellation forBoarding destinationDisplay{frontText} serviceJourney{line{id name publicCode transportMode transportSubmode}}}}}`;
function reply(code, data) { return {statusCode:code, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(data)}; }
async function graphql(query, variables) {
 const response=await fetch(API,{method:'POST',headers:HEADERS,body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(14000)});
 if(!response.ok) throw Error('Entur svarte med HTTP '+response.status);
 const json=await response.json(); if(json.errors?.length) throw Error('Entur: '+json.errors[0].message);
 return json.data;
}
function haversine(a,b,c,d){const R=6371,toRad=v=>v*Math.PI/180;const x=Math.sin(toRad(c-a)/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(toRad(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function isWater(stop){return stop.transportMode?.includes('water') || stop.transportSubmode?.some(s=>/ferry/i.test(s));}
async function route(lat,lon,stop){
 // OSRM's public demo service is for prototyping ONLY. Replace with contracted router before launch.
 const url=`https://router.project-osrm.org/route/v1/driving/${lon},${lat};${stop.longitude},${stop.latitude}?overview=false`;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!r.ok)return null;const j=await r.json();const route=j.routes?.[0];return j.code==='Ok'&&route&&Number.isFinite(route.duration)?{minutes:Math.ceil(route.duration/60),distanceKm:Math.round(route.distance/100)/10,source:'OSRM-test'}:null;}catch{return null;}
}
export async function handler(event){
 try{
  const p=event.queryStringParameters||{};const lat=Number(p.lat),lon=Number(p.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<57||lat>72||lon<4||lon>32)return reply(400,{error:'Ugyldig norsk GPS-posisjon.'});
  const search=(p.search||'').trim().slice(0,75);
  const radius=Math.min(0.75,Math.max(0.16,Number(p.radius)||0.75)); // degrees latitude ~18–83 km
  const diffLon=radius/Math.max(.34,Math.cos(lat*Math.PI/180));
  const bounds={a:lat-radius,b:lon-diffLon,c:lat+radius,d:lon+diffLon};
  const raw=(await graphql(Q_STOPS,bounds)).stopPlacesByBbox||[];
  let stops=raw.filter(s=>isWater(s)&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude))
    .map(s=>({...s,straightKm:haversine(lat,lon,s.latitude,s.longitude)}))
    .sort((a,b)=>a.straightKm-b.straightKm);
  if(search){const q=search.toLocaleLowerCase('no-NO');stops=stops.filter(s=>s.name.toLocaleLowerCase('no-NO').includes(q));}
  stops=stops.slice(0,search?7:60);
  if(!stops.length)return reply(200,{stops:[],fetchedAt:new Date().toISOString(),message:search?'Fant ingen ferjekaier med dette navnet i søkeområdet.':'Ingen registrerte ferjekaier ble funnet i søkeområdet.'});
  const start=new Date(Date.now()-75*60000).toISOString();
  const data=await graphql(Q_CALLS,{ids:stops.map(s=>s.id),start});
  const byId=new Map((data.stopPlaces||[]).filter(Boolean).map(s=>[s.id,s]));
  const eligibleStops=stops.flatMap(s=>{
    const details=byId.get(s.id);
    const calls=(details?.estimatedCalls||[]).filter(c=>{
      const line=c.serviceJourney?.line;
      return c.forBoarding && line?.transportMode==='water' && Object.hasOwn(roadFerries,line.id);
    })
     .map(c=>{
       const line=c.serviceJourney.line;
       return {aimed:c.aimedDepartureTime,expected:c.expectedDepartureTime||c.aimedDepartureTime,realtime:c.realtime,cancelled:c.cancellation,destination:c.destinationDisplay?.frontText||'',line:line.name,lineId:line.id,carFerry:true,samband:roadFerries[line.id]};
     })
     .sort((a,b)=>new Date(a.expected)-new Date(b.expected));
    if (!calls.length) return [];
    return [{stop:s,calls,priority:Math.min(...calls.map(call=>call.samband.priority))}];
  });
  eligibleStops.sort((a,b)=>a.priority-b.priority||a.stop.straightKm-b.stop.straightKm);
  const output=await Promise.all(eligibleStops.slice(0,search?7:9).map(async ({stop,calls})=>({
    id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,
    straightKm:Math.round(stop.straightKm*10)/10,route:await route(lat,lon,stop),departures:calls
  })));
  return reply(200,{stops:output,fetchedAt:new Date().toISOString(),routingProvider:'OSRM public demo — ikke produksjonsklar',timetableProvider:'Entur Journey Planner v3'});
 }catch(e){console.error('Ferjekompis API:',e);return reply(502,{error:'Kunne ikke hente ferske opplysninger. '+e.message});}
}
