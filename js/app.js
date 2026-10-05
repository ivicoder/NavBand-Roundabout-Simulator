import { DEFAULT_BASE, valhallaLocate, valhallaRoute } from "./valhalla.js";
import { analyzeScenario, evaluateExpectedExit } from "./resolver.js";

const $ = (id) => document.getElementById(id);
const state = { scenarios: [], currentScenario: null, result: null, map: null, currentMarker: null, targetMarker: null, routeLayer: null };
const DEFAULT_CENTER = [41.9028, 12.4964];

function initMap() {
  state.map = L.map("map").setView(DEFAULT_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.map);
}
function setModeUI() {
  const live = $("modeSelect").value === "live";
  $("liveSettings").style.display = live ? "block" : "none";
  $("statusPill").textContent = live ? "LIVE" : "REPLAY";
}
function setInput(id, value) { $(id).value = value ?? ""; }
function readScenarioFromUI() {
  return {
    id: state.currentScenario?.id || `custom-${Date.now()}`,
    name: state.currentScenario?.name || "Custom",
    maneuver: $("maneuverSelect").value,
    currentRoad: $("currentRoad").value.trim(),
    targetRoad: $("targetRoad").value.trim(),
    expectedExit: $("expectedExit").value ? Number($("expectedExit").value) : null,
    heading: $("heading").value === "" ? null : Number($("heading").value),
    lat: Number($("lat").value), lon: Number($("lon").value),
    targetLat: Number($("targetLat").value), targetLon: Number($("targetLon").value),
  };
}
function loadScenario(s) {
  state.currentScenario = s;
  setInput("maneuverSelect", s.maneuver || "ROUNDABOUT");
  setInput("currentRoad", s.currentRoad || ""); setInput("targetRoad", s.targetRoad || "");
  setInput("expectedExit", s.expectedExit ?? ""); setInput("heading", s.heading ?? "");
  setInput("lat", s.lat ?? ""); setInput("lon", s.lon ?? "");
  setInput("targetLat", s.targetLat ?? ""); setInput("targetLon", s.targetLon ?? "");
  paintMarkers(); clearResults();
}
function clearResults() {
  state.result = null;
  $("confidenceBadge").className = "badge neutral"; $("confidenceBadge").textContent = "—";
  $("exitValue").textContent = "—"; $("scoreValue").textContent = "Score —";
  $("summaryText").textContent = "Nessuna analisi eseguita."; $("signals").innerHTML = "";
  $("exitTable").className = "exit-table empty"; $("exitTable").textContent = "Esegui un'analisi per vedere i dati.";
  $("debugOutput").textContent = "";
}
function markerIcon(text) { return L.divIcon({ className: "", html: `<div class="marker-label">${escapeHtml(text)}</div>`, iconSize: [90,24], iconAnchor: [45,12] }); }
function paintMarkers() {
  if (!state.map) return;
  if (state.currentMarker) state.map.removeLayer(state.currentMarker);
  if (state.targetMarker) state.map.removeLayer(state.targetMarker);
  if (state.routeLayer) { state.map.removeLayer(state.routeLayer); state.routeLayer = null; }
  const s = readScenarioFromUI(), points = [];
  if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) { state.currentMarker = L.marker([s.lat,s.lon],{icon:markerIcon("MAPS: attuale")}).addTo(state.map).bindPopup("Posizione corrente"); points.push(state.currentMarker.getLatLng()); }
  if (Number.isFinite(s.targetLat) && Number.isFinite(s.targetLon)) { state.targetMarker = L.marker([s.targetLat,s.targetLon],{icon:markerIcon("TARGET")}).addTo(state.map).bindPopup("Target road / punto di verifica"); points.push(state.targetMarker.getLatLng()); }
  if (points.length === 2) state.map.fitBounds(L.latLngBounds(points).pad(.35)); else if (points.length === 1) state.map.setView(points[0],16);
}
function decodePolyline6(str) {
  let index=0,lat=0,lon=0; const coordinates=[];
  while(index<str.length){let result=0,shift=0,b;do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32);lat+=result&1?~(result>>1):result>>1;result=0;shift=0;do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32);lon+=result&1?~(result>>1):result>>1;coordinates.push([lat/1e6,lon/1e6])}return coordinates;
}
function paintRoute(routeResult) {
  if (state.routeLayer) state.map.removeLayer(state.routeLayer);
  const encoded = routeResult?.trip?.legs?.[0]?.shape; if (!encoded) return;
  const coords = decodePolyline6(encoded); if (!coords.length) return;
  state.routeLayer = L.polyline(coords,{weight:5,opacity:.8}).addTo(state.map); state.map.fitBounds(state.routeLayer.getBounds().pad(.25));
}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function renderSignal(name,value,tone=""){return `<div class="signal ${tone}"><span>${escapeHtml(name)}</span><span class="value">${escapeHtml(value)}</span></div>`}
function renderResult(result,evaluation){
  const level=String(result.confidence||"LOW").toLowerCase(); $("confidenceBadge").className=`badge ${level}`; $("confidenceBadge").textContent=result.confidence||"LOW";
  $("exitValue").textContent=Number.isFinite(result.predictedExit)?result.predictedExit:"—"; $("scoreValue").textContent=`Score ${result.score}/100`;
  const evalText=evaluation?(evaluation.correct?`Test: corretto (atteso ${evaluation.expected}, ottenuto ${evaluation.predicted}).`:`Test: ERRORE (atteso ${evaluation.expected}, ottenuto ${evaluation.predicted??"—"}).`):"";
  $("summaryText").textContent=[...(result.reasons||[]),...(result.warnings||[]),evalText].filter(Boolean).join(" ");
  $("signals").innerHTML=[
    renderSignal("Roundabout",result.roundabout?"trovata":"non trovata",result.roundabout?"good":"bad"),
    renderSignal("Exit",Number.isFinite(result.predictedExit)?String(result.predictedExit):"—"),
    renderSignal("Confidence",`${result.score}/100 · ${result.confidence}`),
    renderSignal("Current road",(result.currentNames||[]).slice(0,3).join(" / ")||"—"),
    renderSignal("Target road",(result.targetNames||[]).slice(0,3).join(" / ")||"—")
  ].join("");
  if(result.candidates?.length){$("exitTable").className="exit-table";$("exitTable").innerHTML=result.candidates.map(c=>`<div class="exit-row ${c.selected?"selected":""}"><div class="num">${escapeHtml(c.exit)}</div><div class="road">${escapeHtml(c.road)}</div><div class="score">${escapeHtml(c.score)}</div></div>`).join("")}else{$("exitTable").className="exit-table empty";$("exitTable").textContent="Nessun candidato strutturato disponibile."}
  $("debugOutput").textContent=JSON.stringify({result,evaluation},null,2);
}
function configFromUI(){return{baseUrl:$("valhallaBase").value.trim()||DEFAULT_BASE,apiKey:$("apiKey").value.trim(),clientId:$("clientId").value.trim()}}
async function analyze(){
  const mode=$("modeSelect").value, scenario=readScenarioFromUI(); $("analyzeBtn").disabled=true; $("analyzeBtn").textContent="ANALISI…"; $("summaryText").textContent="Analisi in corso…";
  try{
    let routeResult=null,locateResult=null;
    if(mode==="replay"){
      const fixture=state.currentScenario?.fixture; routeResult=fixture?.route||null; locateResult=fixture?.locate||null; if(!routeResult) throw new Error("Lo scenario Replay non contiene un fixture Valhalla.");
    }else{
      if(!Number.isFinite(scenario.lat)||!Number.isFinite(scenario.lon)||!Number.isFinite(scenario.targetLat)||!Number.isFinite(scenario.targetLon)) throw new Error("In Live servono posizione corrente e target lat/lon.");
      const config=configFromUI();

routeResult=await valhallaRoute(config,scenario);
locateResult=await valhallaLocate(config,scenario);

console.log("=== VALHALLA LOCATE START/TARGET ===");
console.log(JSON.stringify(locateResult, null, 2));

const roundaboutManeuver=(routeResult?.trip?.legs||[])
  .flatMap(leg=>leg?.maneuvers||[])
  .find(m=>Number.isFinite(Number(m?.roundabout_exit_count)) || m?.type===26 || m?.type===27);

const roundaboutPoints=[];
if(roundaboutManeuver){
  for(const p of [
    {lat:roundaboutManeuver.begin_lat,lon:roundaboutManeuver.begin_lon,label:"BEGIN"},
    {lat:roundaboutManeuver.end_lat,lon:roundaboutManeuver.end_lon,label:"END"}
  ]){
    if(Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))){
      roundaboutPoints.push(p);
    }
  }
}

if(roundaboutPoints.length){
  const roundaboutLocate=await valhallaLocatePoints(config,roundaboutPoints);

  console.log("=== ROUNDABOUT LOCATE ===");

  const compact=roundaboutLocate.map((item,index)=>({
    point:roundaboutPoints[index],
    input_lat:item?.input_lat,
    input_lon:item?.input_lon,
    nodes:(item?.nodes||[]).map(n=>({
      id:n?.node_id?.value ?? n?.node_id?.id ?? null,
      lat:n?.lat ?? null,
      lon:n?.lon ?? null,
      type:n?.type ?? null,
      edge_count:n?.edge_count ?? null
    })),
    edges:(item?.edges||[]).map(e=>({
      edgeId:e?.edge_id?.value ?? e?.edge_id?.id ?? null,
      wayId:e?.edge_info?.way_id ?? null,
      names:e?.edge_info?.names ?? [],
      roundabout:e?.edge?.round_about === true,
      car:e?.edge?.access?.car === true,
      forward:e?.edge?.forward ?? null,
      use:e?.edge?.classification?.use ?? e?.edge?.use ?? null,
      startNode:e?.edge?.start_node?.value ?? e?.edge?.start_node?.id ?? null,
      endNode:e?.edge?.end_node?.value ?? e?.edge?.end_node?.id ?? null,
      correlatedLat:e?.correlated_lat ?? null,
      correlatedLon:e?.correlated_lon ?? null,
      percentAlong:e?.percent_along ?? null,
      shape:e?.edge_info?.shape ?? null
    }))
  }));

  console.log(JSON.stringify(compact,null,2));
}

    }
    paintRoute(routeResult); const result=analyzeScenario({scenario,routeResult,locateResult}); const evaluation=evaluateExpectedExit(result,scenario.expectedExit); state.result=result; renderResult(result,evaluation);
  }catch(error){state.result=null;$("confidenceBadge").className="badge low";$("confidenceBadge").textContent="ERROR";$("exitValue").textContent="!";$("scoreValue").textContent="Analisi non disponibile";$("summaryText").textContent=error?.message||String(error);$("debugOutput").textContent=String(error?.stack||error)}finally{$("analyzeBtn").disabled=false;$("analyzeBtn").textContent="ANALIZZA SCENARIO"}
}
function exportScenario(){const s=readScenarioFromUI();const blob=new Blob([JSON.stringify(s,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${(s.name||"scenario").toLowerCase().replace(/[^a-z0-9]+/g,"_")}.json`;a.click();URL.revokeObjectURL(url)}
async function loadScenarios(){const r=await fetch("data/scenarios.json",{cache:"no-store"});if(!r.ok)throw new Error(`Scenari HTTP ${r.status}`);state.scenarios=await r.json();$("scenarioSelect").innerHTML=state.scenarios.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("");if(state.scenarios.length)loadScenario(state.scenarios[0])}
function browserLocate(){if(!navigator.geolocation){alert("Geolocalizzazione browser non disponibile.");return}navigator.geolocation.getCurrentPosition(p=>{setInput("lat",p.coords.latitude.toFixed(6));setInput("lon",p.coords.longitude.toFixed(6));if(Number.isFinite(p.coords.heading))setInput("heading",Number(p.coords.heading).toFixed(1));paintMarkers()},e=>alert(`GPS browser non disponibile: ${e.message}`),{enableHighAccuracy:true,timeout:12000,maximumAge:10000})}
function setupEvents(){
  $("modeSelect").addEventListener("change",setModeUI);
  $("scenarioSelect").addEventListener("change",()=>{const s=state.scenarios.find(x=>x.id===$("scenarioSelect").value);if(s)loadScenario(s)});
  $("loadScenarioBtn").addEventListener("click",()=>{const s=state.scenarios.find(x=>x.id===$("scenarioSelect").value);if(s)loadScenario(s)});
  $("saveScenarioBtn").addEventListener("click",exportScenario); $("locateBtn").addEventListener("click",browserLocate);
  $("clearMapBtn").addEventListener("click",()=>{["lat","lon","targetLat","targetLon"].forEach(id=>$(id).value="");paintMarkers()}); $("analyzeBtn").addEventListener("click",analyze);
  ["lat","lon","targetLat","targetLon"].forEach(id=>$(id).addEventListener("change",paintMarkers));
}
async function main(){initMap();setupEvents();setModeUI();try{await loadScenarios()}catch(e){$("summaryText").textContent=`Errore caricamento scenari: ${e.message}`}}
main();
