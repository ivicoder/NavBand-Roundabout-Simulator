const DEFAULT_BASE = "https://valhalla1.openstreetmap.de";

function normalizeBaseUrl(value) {
  const base = String(value || DEFAULT_BASE).trim().replace(/\/+$/, "");
  return base || DEFAULT_BASE;
}

async function postJson(url, payload, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.clientId) headers["X-Client-Id"] = options.clientId;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    mode: "cors",
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.error || data?.message || text || `HTTP ${response.status}`;
    throw new Error(`Valhalla HTTP ${response.status}: ${message}`);
  }
  return data;
}

export async function valhallaRoute(config, scenario) {
  const payload = {
    locations: [
      {
        lat: Number(scenario.lat),
        lon: Number(scenario.lon),
        ...(Number.isFinite(Number(scenario.heading))
          ? { heading: Number(scenario.heading), heading_tolerance: 45 }
          : {}),
      },
      { lat: Number(scenario.targetLat), lon: Number(scenario.targetLon) },
    ],
    costing: "auto",
    directions_options: { units: "kilometers", language: "it-IT" },
  };
  if (config.apiKey) payload.api_key = config.apiKey;
  return postJson(`${normalizeBaseUrl(config.baseUrl)}/route`, payload, {
    clientId: config.clientId,
  });
}

export async function valhallaLocate(config, scenario) {
  const locations = [{ lat: Number(scenario.lat), lon: Number(scenario.lon) }];
  if (Number.isFinite(Number(scenario.targetLat)) && Number.isFinite(Number(scenario.targetLon))) {
    locations.push({ lat: Number(scenario.targetLat), lon: Number(scenario.targetLon) });
  }
  const payload = { verbose: true, locations, costing: "auto" };
  if (config.apiKey) payload.api_key = config.apiKey;
  return postJson(`${normalizeBaseUrl(config.baseUrl)}/locate`, payload, {
    clientId: config.clientId,
  });
}


export async function valhallaLocatePoints(config, points) {
  const locations = (points || [])
    .filter((p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)))
    .map((p) => ({
      lat: Number(p.lat),
      lon: Number(p.lon),
    }));

  if (!locations.length) return [];

  const payload = {
    verbose: true,
    locations,
    costing: "auto",
  };

  if (config.apiKey) payload.api_key = config.apiKey;

  return postJson(`${normalizeBaseUrl(config.baseUrl)}/locate`, payload, {
    clientId: config.clientId,
  });
}

export { DEFAULT_BASE };
