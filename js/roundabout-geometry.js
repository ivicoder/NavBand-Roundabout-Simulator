const POLYLINE6_FACTOR = 1e-6;

export function decodePolyline6(encoded) {
  if (!encoded) return [];

  let index = 0;
  let lat = 0;
  let lon = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat =
      (result & 1) ? ~(result >> 1) : (result >> 1);

    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLon =
      (result & 1) ? ~(result >> 1) : (result >> 1);

    lon += deltaLon;

    coordinates.push({
      lat: lat * POLYLINE6_FACTOR,
      lon: lon * POLYLINE6_FACTOR
    });
  }

  return coordinates;
}

export function edgeGeometry(edge) {
  return decodePolyline6(edge?.shape ?? "");
}

export function pointDistanceMeters(a, b) {
  if (!a || !b) return Infinity;

  const R = 6371000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function geometryLengthMeters(points) {
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    total += pointDistanceMeters(points[i - 1], points[i]);
  }

  return total;
}

export function geometryBearing(a, b) {
  if (!a || !b) return null;

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);

  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) *
    Math.cos(lat2) *
    Math.cos(dLon);

  return (
    Math.atan2(y, x) * 180 / Math.PI + 360
  ) % 360;
}

export function edgeSummary(edge) {
  const geometry = edgeGeometry(edge);

  return {
    id: edge?.id ?? null,
    wayId: edge?.wayId ?? null,
    names: edge?.names ?? [],
    roundabout: edge?.roundabout === true,
    auto: edge?.auto === true,
    geometry,
    lengthMeters: geometryLengthMeters(geometry),
    entryBearing:
      geometry.length >= 2
        ? geometryBearing(geometry[0], geometry[1])
        : null,
    exitBearing:
      geometry.length >= 2
        ? geometryBearing(
            geometry[geometry.length - 2],
            geometry[geometry.length - 1]
          )
        : null
  };
}

export function summarizeEdges(edges) {
  return (edges || [])
    .map(edgeSummary)
    .filter(edge => edge.geometry.length >= 2);
}
