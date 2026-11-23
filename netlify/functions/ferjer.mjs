import roadFerries from './road-ferries.json' with { type: 'json' };
import { getStore } from '@netlify/blobs';
const API = 'https://api.entur.io/journey-planner/v3/graphql';
const CLIENT = process.env.ENTUR_CLIENT_NAME || 'ferjekompis-web';
const SVV_USERNAME = process.env.SVV_ROUTING_USERNAME || '';
const SVV_PASSWORD = process.env.SVV_ROUTING_PASSWORD || '';
const SVV_DAILY_LIMIT = 2500;
const SVV_API = 'https://www.vegvesen.no/ws/no/vegvesen/ruteplan/routingservice_v3_0/open/routingservice/api/Route/best';
const HEADERS = { 'content-type': 'application/json', 'ET-Client-Name': CLIENT };
const Q_STOPS = `query($a:Float!,$b:Float!,$c:Float!,$d:Float!){stopPlacesByBbox(minimumLatitude:$a,minimumLongitude:$b,maximumLatitude:$c,maximumLongitude:$d,filterByInUse:true){id name latitude longitude transportMode transportSubmode}}`;
const FERRY_FILTERS = [{select:[{lines:Object.keys(roadFerries)}]}];
const Q_CALLS = `query($ids:[String],$start:DateTime,$filters:[EstimatedCallFilterInput!]!){stopPlaces(ids:$ids){id name latitude longitude estimatedCalls(startTime:$start,timeRange:43200,numberOfDepartures:45,includeCancelledTrips:true,filters:$filters){aimedDepartureTime expectedDepartureTime realtime cancellation forBoarding destinationDisplay{frontText} serviceJourney{line{id name publicCode transportMode transportSubmode}}}}}`;
const Q_TRIANGLE_CALLS = `query($ids:[String],$start:DateTime,$filters:[EstimatedCallFilterInput!]!){stopPlaces(ids:$ids){id name latitude longitude estimatedCalls(startTime:$start,timeRange:43200,numberOfDepartures:45,includeCancelledTrips:true,filters:$filters){aimedDepartureTime expectedDepartureTime realtime cancellation forBoarding destinationDisplay{frontText} serviceJourney{line{id name publicCode transportMode transportSubmode} quays{stopPlace{id name parent{id name}}}}}}}`;
const Q_LINE_STOPS = `query($id:ID!){line(id:$id){quays{stopPlace{id name latitude longitude parent{id name latitude longitude}}}}}`;
const Q_LINES = `query($ids:[ID]){lines(ids:$ids){id quays{stopPlace{id name latitude longitude parent{id name latitude longitude}}}}}`;
function reply(code, data) { return {statusCode:code, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(data)}; }
async function graphql(query, variables) {
 const response=await fetch(API,{method:'POST',headers:HEADERS,body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(14000)});
 if(!response.ok) throw Error('Entur svarte med HTTP '+response.status);
 const json=await response.json(); if(json.errors?.length) throw Error('Entur: '+json.errors[0].message);
 return json.data;
}
function haversine(a,b,c,d){const R=6371,toRad=v=>v*Math.PI/180;const x=Math.sin(toRad(c-a)/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(toRad(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function isWater(stop){return stop.transportMode?.includes('water') || stop.transportSubmode?.some(s=>/ferry/i.test(s));}
function normalizePlace(name){
 return name.normalize('NFC').toLocaleLowerCase('nb-NO').replace(/\b(?:ferjekai|fergekai|kai)\b/g,'').trim();
}
function lineTerminals(line){
 const seen=new Set(),terminals=[];
 for(const quay of line?.quays||[]){
  const stop=quay.stopPlace?.parent||quay.stopPlace;
  const key=normalizePlace(stop?.name||'');
  if(!key||seen.has(key))continue;
  seen.add(key);
  terminals.push(stop.name.replace(/\s+(?:ferjekai|fergekai|kai)$/i,'').trim());
 }
 return terminals;
}
async function discoverTerminals(lineIds=[]){
 const ids=[...new Set(lineIds)].filter(id=>Object.hasOwn(roadFerries,id));
 const discovered=new Map();
 for(let offset=0;offset<ids.length;offset+=50){
  try{
   const {lines=[]}=await graphql(Q_LINES,{ids:ids.slice(offset,offset+50)});
   for(const line of lines)discovered.set(line.id,lineTerminals(line));
  }catch(error){console.warn('Entur kaioppdaging feila; viser vanlege sambandskort:',error.message);}
 }
 return discovered;
}
function withTerminals(calls=[],terminalMap=new Map()){
 return calls.map(call=>{
  const terminals=terminalMap.get(call.lineId);
  return terminals?.length>=3?{...call,samband:{...call.samband,terminals}}:call;
 });
}
function departures(calls=[],destinationOverride='',terminalMap=new Map()){
 return calls.filter(call=>{
  const line=call.serviceJourney?.line;
  return call.forBoarding&&line?.transportMode==='water'&&Object.hasOwn(roadFerries,line.id);
 }).map(call=>{
  const line=call.serviceJourney.line;
  const terminals=terminalMap.get(line.id);
  return {aimed:call.aimedDepartureTime,expected:call.expectedDepartureTime||call.aimedDepartureTime,realtime:call.realtime,cancelled:call.cancellation,destination:destinationOverride||call.destinationDisplay?.frontText||'',line:line.name,lineId:line.id,carFerry:true,samband:terminals?.length>=3?{...roadFerries[line.id],terminals}:roadFerries[line.id]};
 }).sort((a,b)=>Date.parse(a.expected)-Date.parse(b.expected));
}
async function nearbyWaterStops([lon,lat]){
 const radius=0.025;
 const width=radius/Math.max(.34,Math.cos(lat*Math.PI/180));
 const data=await graphql(Q_STOPS,{a:lat-radius,b:lon-width,c:lat+radius,d:lon+width});
 return (data.stopPlacesByBbox||[]).filter(s=>isWater(s)&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude))
  .map(s=>({...s,offset:haversine(lat,lon,s.latitude,s.longitude)}))
  .filter(s=>s.offset<=2)
  .sort((a,b)=>a.offset-b.offset);
}
async function journey(lat,lon,destination){
 const words=new URLSearchParams({text:destination,size:'1'});
 const geocoder=await fetch('https://api.entur.io/geocoder/v1/autocomplete?'+words,{headers:HEADERS,signal:AbortSignal.timeout(7000)});
 if(!geocoder.ok)throw Error('Kunne ikke slå opp reisemålet.');
 const place=(await geocoder.json()).features?.[0];
 const fetchedAt=new Date().toISOString();
 if(!place)return {stops:[],destination,fetchedAt,message:'Fant ikke reisemålet. Prøv et stedsnavn med kommune eller en adresse.'};
 const label=place.properties?.label||destination;
 const coordinates=place.geometry.coordinates;
 const routing=await fetch(`https://router.project-osrm.org/route/v1/driving/${lon},${lat};${coordinates.join(',')}?steps=true&overview=false`,{signal:AbortSignal.timeout(12000)});
 if(!routing.ok)throw Error('Kunne ikke beregne bilrute til reisemålet.');
 const steps=(await routing.json()).routes?.[0]?.legs.flatMap(leg=>leg.steps);
 if(!steps)return {stops:[],destination:label,fetchedAt,message:'Fant ingen bilrute til reisemålet.'};
 const crossings=[];
 let elapsed=0, distance=0;
 for(let i=0;i<steps.length;i++){
  const step=steps[i];
  if(step.mode==='ferry'){
   const crossing={name:step.name||'Ferjestrekning',from:step.maneuver.location,minutes:Math.ceil(elapsed/60),distanceKm:Math.round(distance/100)/10};
   while(steps[i+1]?.mode==='ferry'){
    elapsed+=steps[i].duration;
    distance+=steps[i].distance;
    i++;
   }
   crossing.to=steps[i+1]?.maneuver.location;
   if(crossing.to)crossings.push(crossing);
  }
  elapsed+=steps[i].duration;
  distance+=steps[i].distance;
 }
 if(!crossings.length)return {stops:[],destination:label,fetchedAt,message:'Den beregnede bilruta har ingen ferjestrekninger.'};
 const terminals=await Promise.all(crossings.map(async crossing=>{
  const [boarding,landing]=await Promise.all([nearbyWaterStops(crossing.from),nearbyWaterStops(crossing.to)]);
  return {...crossing,boarding,landing};
 }));
 const ids=[...new Set(terminals.flatMap(c=>c.boarding.map(s=>s.id)))];
 const start=new Date(Date.now()-75*60000).toISOString();
 const calls=ids.length?(await graphql(Q_CALLS,{ids,start,filters:FERRY_FILTERS})).stopPlaces||[]:[];
 const byId=new Map(calls.filter(Boolean).map(s=>[s.id,departures(s.estimatedCalls)]));
 const unmatched=[];
 const stops=terminals.flatMap((crossing,index)=>{
  const landingNames=new Set(crossing.landing.map(s=>normalizePlace(s.name)));
  const match=crossing.boarding.map(stop=>({stop,calls:(byId.get(stop.id)||[]).filter(call=>landingNames.has(normalizePlace(call.destination)))})).find(s=>s.calls.length);
  if(!match){unmatched.push(crossing.name);return [];}
  const {stop,calls}=match;
  return [{id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,journeyOrder:index,
    straightKm:Math.round(haversine(lat,lon,stop.latitude,stop.longitude)*10)/10,
    route:index===0?{minutes:crossing.minutes,distanceKm:crossing.distanceKm}:null,departures:calls}];
 });
 return {stops,destination:label,fetchedAt,...(unmatched.length?{message:'Fant ikke sikre Entur-avganger for '+unmatched.join(', ')+'.'}:{})};
}
function norwegianDate(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=Object.fromEntries(parts.map(({type,value})=>[type,value]));
 return `${part.year}-${part.month}-${part.day}`;
}
async function reserveSvvRouteCall(){
 try{
  const store=getStore({name:'ferjekompis-svv-routing-usage'});
  const day=norwegianDate();
  for(let attempt=0;attempt<20;attempt++){
   const current=await store.getWithMetadata(day,{consistency:'strong',type:'json'});
   const count=Number.isSafeInteger(current?.data?.count)?current.data.count:0;
   if(count>=SVV_DAILY_LIMIT)return false;
   const result=await store.setJSON(day,{count:count+1,updatedAt:new Date().toISOString()},current?.etag?{onlyIfMatch:current.etag}:{onlyIfNew:true});
   if(result.modified)return true;
  }
 }catch{}
 // Fail closed: if the shared counter is unavailable, keep using OSRM.
 return false;
}
async function osrmRoute(lat,lon,stop){
 // OSRM's public demo service is for prototyping ONLY. Replace with contracted router before launch.
 const url=`https://router.project-osrm.org/route/v1/driving/${lon},${lat};${stop.longitude},${stop.latitude}?overview=false`;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!r.ok)return null;const j=await r.json();const route=j.routes?.[0];return j.code==='Ok'&&route&&Number.isFinite(route.duration)?{minutes:Math.ceil(route.duration/60),distanceKm:Math.round(route.distance/100)/10,source:'OSRM-test'}:null;}catch{return null;}
}
async function route(lat,lon,stop){
 if(SVV_USERNAME&&SVV_PASSWORD&&await reserveSvvRouteCall()){
  try{
   const params=new URLSearchParams({
    Stops:`${lon},${lat};${stop.longitude},${stop.latitude}`,
    InputSRS:'EPSG_4326',OutputSRS:'EPSG_4326',Lang:'Norwegian',IncludeObstructedRoutes:'false'
   });
   const response=await fetch(`${SVV_API}?${params}`,{
    headers:{accept:'application/json',authorization:`Basic ${Buffer.from(`${SVV_USERNAME}:${SVV_PASSWORD}`).toString('base64')}`},
    signal:AbortSignal.timeout(7000)
   });
   if(response.ok){
    const payload=await response.json();
    const svvRoute=payload.routes?.find(candidate=>!candidate.isObstructed)||payload.routes?.[0];
    const minutes=Number(svvRoute?.statistic?.totalTime);
    const distanceMeters=Number(svvRoute?.statistic?.totalLength);
    if(Number.isFinite(minutes)&&minutes>0&&Number.isFinite(distanceMeters)&&distanceMeters>0)return {
     minutes:Math.ceil(minutes),distanceKm:Math.round(distanceMeters/100)/10,source:'Statens vegvesen'
    };
   }
  }catch{}
 }
 // Missing credentials, daily cap, or Vegvesen error: preserve OSRM as the fallback.
 return osrmRoute(lat,lon,stop);
}
async function searchPiers(text){
 const params=new URLSearchParams({q:text,stopPlaceTypes:'ferryStop,harbourPort',limit:'8'});
 const response=await fetch('https://api.entur.io/geocoder/v3/autocomplete?'+params,{headers:HEADERS,signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('Kunne ikke søke etter ferjekaier.');
 const {features=[]}=await response.json();
 return features.flatMap(({properties:p})=>p.id?.startsWith('NSR:StopPlace:')&&p.names?.display
  ?[{id:p.id,label:p.names.display}]:[]);
}
async function nearbyPlace(lat,lon){
 const params=new URLSearchParams({'point.lat':String(lat),'point.lon':String(lon),lang:'no',size:'5',layers:'locality,address'});
 const response=await fetch('https://api.entur.io/geocoder/v1/reverse?'+params,{headers:HEADERS,signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Kunne ikke slå opp nærområdet.');
 const {features=[]}=await response.json();
 const place=features.find(({properties:p={}})=>Array.isArray(p.category)&&p.category.some(c=>/place|neighbourhood/i.test(c)))
  ||features.find(({properties:p={}})=>p.locality||p.layer==='locality');
 const p=place?.properties;
 return p?.name||p?.locality||'';
}
async function selectedPier(id,origin){
 const start=new Date(Date.now()-75*60000).toISOString();
 const {stopPlaces}=await graphql(Q_CALLS,{ids:[id],start,filters:FERRY_FILTERS});
 const stop=stopPlaces?.[0];
 if(!stop)return null;
 const calls=departures(stop.estimatedCalls);
 const terminalMap=await discoverTerminals(calls.map(call=>call.lineId));
 return {id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,
  straightKm:origin?Math.round(haversine(origin.lat,origin.lon,stop.latitude,stop.longitude)*10)/10:null,
  route:origin?await route(origin.lat,origin.lon,stop):null,departures:withTerminals(calls,terminalMap)};
}
async function triangleDestination(lat,lon,lineId,fromName,to,line,terminals){
 const source=(line?.quays||[]).map(quay=>quay.stopPlace?.parent||quay.stopPlace).filter(Boolean)
  .find(stop=>normalizePlace(stop.name)===normalizePlace(fromName));
 if(!source)return {stops:[],message:'Fant ikkje avreisekaia for dette sambandet i Entur.'};
 const fromStopId=source.id;
 const start=new Date(Date.now()-75*60000).toISOString();
 const {stopPlaces}=await graphql(Q_TRIANGLE_CALLS,{ids:[fromStopId],start,filters:FERRY_FILTERS});
 const stop=stopPlaces?.[0];
 if(!stop)return {stops:[],message:'Fant ikkje avreisekaia i Entur.'};
 const target=normalizePlace(to);
 const calls=(stop.estimatedCalls||[]).filter(call=>{
  const service=call.serviceJourney;
  if(!call.forBoarding||service?.line?.id!==lineId)return false;
  const path=(service.quays||[]).map(quay=>quay.stopPlace?.parent||quay.stopPlace).filter(Boolean);
  const fromIndex=path.findIndex(place=>place.id===fromStopId||normalizePlace(place.name)===normalizePlace(stop.name));
  return fromIndex>=0&&path.slice(fromIndex+1).some(place=>normalizePlace(place.name)===target);
 });
 const origin=Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=57&&lat<=72&&lon>=4&&lon<=32?{lat,lon}:null;
 return {stops:[{id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,
  straightKm:origin?Math.round(haversine(origin.lat,origin.lon,stop.latitude,stop.longitude)*10)/10:null,
  route:origin?await route(origin.lat,origin.lon,stop):null,departures:departures(calls,to,new Map([[lineId,terminals]]))}],fetchedAt:new Date().toISOString()};
}
async function otherDirection(lat,lon,lineId,fromStopId,destination){
 const {line}=await graphql(Q_LINE_STOPS,{id:lineId});
 const terminals=lineTerminals(line);
 const terminalMap=new Map([[lineId,terminals]]);
 const candidates=new Map();
 let originName='';
 for(const quay of line?.quays||[]){
  const place=quay.stopPlace;
  const stop=place?.parent||place;
  if(!stop)continue;
  if(stop.id===fromStopId||place.id===fromStopId)originName=normalizePlace(stop.name);
  else if(Number.isFinite(stop.latitude)&&Number.isFinite(stop.longitude))candidates.set(stop.id,stop);
 }
 if(!originName)return [];
 const target=normalizePlace(destination);
 const named=[...candidates.values()].filter(stop=>target&&normalizePlace(stop.name)===target);
 const ids=named.length?named.map(stop=>stop.id):[...candidates.keys()];
 if(!ids.length)return [];
 const start=new Date(Date.now()-75*60000).toISOString();
 const {stopPlaces}=await graphql(Q_CALLS,{ids,start,filters:FERRY_FILTERS});
 const matches=(stopPlaces||[]).filter(Boolean).flatMap(stop=>{
  const calls=departures(stop.estimatedCalls,'',terminalMap).filter(call=>call.lineId===lineId);
  const returning=calls.filter(call=>originName&&normalizePlace(call.destination)===originName);
  const selected=returning.length?returning:named.length||candidates.size===1?calls:[];
  return selected.length?[{stop,calls:selected}]:[];
 });
 matches.sort((a,b)=>haversine(lat,lon,a.stop.latitude,a.stop.longitude)-haversine(lat,lon,b.stop.latitude,b.stop.longitude));
 if(!matches.length)return [];
 const {stop,calls}=matches[0];
 const hasOrigin=Number.isFinite(lat)&&Number.isFinite(lon);
 return [{id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,straightKm:hasOrigin?Math.round(haversine(lat,lon,stop.latitude,stop.longitude)*10)/10:null,route:hasOrigin?await route(lat,lon,stop):null,departures:calls}];
}
export async function handler(event){
 try{
  const p=event.queryStringParameters||{};const lat=Number(p.lat),lon=Number(p.lon);
  if(typeof p.pierSearch==='string'){
   const text=p.pierSearch.trim().slice(0,75);
   return reply(200,{piers:text.length>=2?await searchPiers(text):[]});
  }
  if(p.nearby==='1'){
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<57||lat>72||lon<4||lon>32)return reply(400,{error:'Ugyldig norsk posisjon.'});
   return reply(200,{name:await nearbyPlace(lat,lon)});
  }
  if(p.stopId){
   if(!/^NSR:StopPlace:\d+$/.test(p.stopId))return reply(400,{error:'Ugyldig ferjekai.'});
   const validOrigin=Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=57&&lat<=72&&lon>=4&&lon<=32;
   const stop=await selectedPier(p.stopId,validOrigin?{lat,lon}:null);
   return reply(200,{stops:stop?[stop]:[],fetchedAt:new Date().toISOString()});
  }
  if(p.triangleTo){
   if(!Object.hasOwn(roadFerries,p.lineId))return reply(400,{error:'Ugyldig ferjesamband.'});
   const {line}=await graphql(Q_LINE_STOPS,{id:p.lineId});
   const terminals=lineTerminals(line);
   const origin=terminals?.find(name=>normalizePlace(name)===normalizePlace(p.triangleFrom));
   const destination=terminals?.find(name=>normalizePlace(name)===normalizePlace(p.triangleTo));
   if(terminals.length<3||!origin||!destination||normalizePlace(origin)===normalizePlace(destination))return reply(400,{error:'Ugyldig kai eller reisemål for fleirkai-sambandet.'});
   const originLat=Number.isFinite(lat)&&lat>=57&&lat<=72&&lon>=4&&lon<=32?lat:NaN;
   const originLon=Number.isFinite(lat)&&lat>=57&&lat<=72&&lon>=4&&lon<=32?lon:NaN;
   return reply(200,await triangleDestination(originLat,originLon,p.lineId,origin,destination,line,terminals));
  }
  const validOrigin=Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=57&&lat<=72&&lon>=4&&lon<=32;
  if(p.lineId){
   if(!Object.hasOwn(roadFerries,p.lineId)||!p.fromStopId?.startsWith('NSR:StopPlace:'))return reply(400,{error:'Ugyldig ferjesamband eller avreisekai.'});
   const stops=await otherDirection(validOrigin?lat:NaN,validOrigin?lon:NaN,p.lineId,p.fromStopId,(p.to||'').slice(0,100));
   return reply(200,{stops,...(!stops.length?{message:'Fant ingen avganger fra den andre kaia i Enturs tidsvindu.'}:{})});
  }
  if(!validOrigin)return reply(400,{error:'Ugyldig norsk GPS-posisjon.'});
  const search=(p.search||'').trim().slice(0,75);
  const destination=(p.destination||'').trim().slice(0,75);
  if(destination)return reply(200,await journey(lat,lon,destination));
  const radius=Math.min(0.75,Math.max(0.16,Number(p.radius)||0.75)); // degrees latitude ~18–83 km
  const diffLon=radius/Math.max(.34,Math.cos(lat*Math.PI/180));
  const bounds={a:lat-radius,b:lon-diffLon,c:lat+radius,d:lon+diffLon};
  const raw=(await graphql(Q_STOPS,bounds)).stopPlacesByBbox||[];
  let stops=raw.filter(s=>isWater(s)&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude))
    .map(s=>({...s,straightKm:haversine(lat,lon,s.latitude,s.longitude)}))
    .sort((a,b)=>a.straightKm-b.straightKm);
  if(search){const q=search.toLocaleLowerCase('no-NO');stops=stops.filter(s=>s.name.toLocaleLowerCase('no-NO').includes(q));}
  stops=stops.slice(0,search?7:60);
  if(!stops.length)return reply(200,{stops:[],destination,fetchedAt:new Date().toISOString(),message:search?'Fant ingen ferjekaier med dette navnet i søkeområdet.':'Ingen registrerte ferjekaier ble funnet i søkeområdet.'});
  const start=new Date(Date.now()-75*60000).toISOString();
  const data=await graphql(Q_CALLS,{ids:stops.map(s=>s.id),start,filters:FERRY_FILTERS});
  const byId=new Map((data.stopPlaces||[]).filter(Boolean).map(s=>[s.id,s]));
  const eligibleStops=stops.flatMap(s=>{
    const details=byId.get(s.id);
    const calls=departures(details?.estimatedCalls);
    if (!calls.length) return [];
    return [{stop:s,calls,priority:Math.min(...calls.map(call=>call.samband.priority))}];
  });
  eligibleStops.sort((a,b)=>a.priority-b.priority||a.stop.straightKm-b.stop.straightKm);
  const visibleStops=eligibleStops.slice(0,search?7:9);
  const terminalMap=await discoverTerminals(visibleStops.flatMap(({calls})=>calls.map(call=>call.lineId)));
  const output=await Promise.all(visibleStops.map(async ({stop,calls})=>({
    id:stop.id,name:stop.name,lat:stop.latitude,lon:stop.longitude,
    straightKm:Math.round(stop.straightKm*10)/10,route:await route(lat,lon,stop),departures:withTerminals(calls,terminalMap)
  })));
  return reply(200,{stops:output,fetchedAt:new Date().toISOString(),routingProvider:SVV_USERNAME&&SVV_PASSWORD?'Statens vegvesen (maks 2 500 kall per norsk kalenderdag), med OSRM-reserve':'OSRM public demo — legg inn Vegvesen-tilgang i Netlify for primærruting',timetableProvider:'Entur Journey Planner v3'});
 }catch(e){console.error('Ferjekompis API:',e);return reply(502,{error:'Kunne ikke hente ferske opplysninger. '+e.message});}
}
