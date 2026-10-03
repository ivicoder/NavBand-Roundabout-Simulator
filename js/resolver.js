export const CONFIDENCE_THRESHOLDS = { HIGH: 85, MEDIUM: 65 };

export function normalizeRoadName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeRoadName(value).split(" ").filter(Boolean));
}

export function roadNameSimilarity(a, b) {
  const aa = normalizeRoadName(a);
  const bb = normalizeRoadName(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.82;
  const A = tokenSet(aa), B = tokenSet(bb);
  const intersection = [...A].filter((t) => B.has(t)).length;
  const union = new Set([...A, ...B]).size || 1;
  return intersection / union;
}

function asItems(result) {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export function namesFromLocate(result) {
  const names = [];
  for (const item of asItems(result)) {
    for (const edge of item?.edges || []) {
      for (const name of edge?.edge_info?.names || []) {
        if (name && !names.includes(name)) names.push(name);
      }
    }
  }
  return names;
}

export function carAccessibleFromLocate(result) {
  const access = [];
  for (const item of asItems(result)) {
    for (const edge of item?.edges || []) {
      if (typeof edge?.edge?.access?.car === "boolean") access.push(edge.edge.access.car);
    }
  }
  if (!access.length) return null;
  return access.some(Boolean);
}

function allManeuvers(routeResult) {
  return (routeResult?.trip?.legs || []).flatMap((leg) => leg?.maneuvers || []);
}

export function findRoundaboutManeuver(routeResult) {
  const maneuvers = allManeuvers(routeResult);
  const enterIndex = maneuvers.findIndex((m) => m?.type === 26 || m?.type === 27);
  if (enterIndex < 0) return null;

  let exitIndex = -1;
  for (let i = enterIndex; i < maneuvers.length; i += 1) {
    if (maneuvers[i]?.type === 27 && Number.isFinite(Number(maneuvers[i]?.roundabout_exit_count))) {
      exitIndex = i;
      break;
    }
  }
  const roundabout = exitIndex >= 0 ? maneuvers[exitIndex] : maneuvers[enterIndex];
  let next = null;
  const startAfter = exitIndex >= 0 ? exitIndex + 1 : enterIndex + 1;
  for (let i = startAfter; i < maneuvers.length; i += 1) {
    if (maneuvers[i]?.type !== 26 && maneuvers[i]?.type !== 27) {
      next = maneuvers[i];
      break;
    }
  }
  return {
    index: exitIndex >= 0 ? exitIndex : enterIndex,
    roundabout,
    next,
    exit: Number.isFinite(Number(roundabout?.roundabout_exit_count))
      ? Number(roundabout.roundabout_exit_count)
      : null,
  };
}

export function computeConfidence({ targetMatch, currentMatch, carAccessKnown, exitFound }) {
  let score = 0;
  score += Math.round(Math.max(0, Math.min(1, targetMatch)) * 45);
  score += Math.round(Math.max(0, Math.min(1, currentMatch)) * 20);
  score += carAccessKnown === true ? 15 : carAccessKnown === false ? 0 : 7;
  score += exitFound ? 20 : 0;
  const level = score >= 85 ? "HIGH" : score >= 65 ? "MEDIUM" : "LOW";
  return { score, level };
}

export function buildCandidateRows(roundaboutInfo, targetRoad) {
  const exit = roundaboutInfo?.exit;
  if (!Number.isFinite(exit)) return [];
  const nextNames = [
    ...(roundaboutInfo.next?.street_names || []),
    ...(roundaboutInfo.next?.begin_street_names || []),
  ].filter(Boolean);
  const road = nextNames[0] || "Strada non identificata";
  const similarity = roadNameSimilarity(targetRoad, nextNames.join(" / ") || road);
  return [{ exit, road, similarity, selected: true, score: Math.round(similarity * 70 + 30) }];
}

export function analyzeScenario({ scenario, routeResult = null, locateResult = null }) {
  if (scenario.maneuver !== "ROUNDABOUT") {
    return {
      predictedExit: null, confidence: "HIGH", score: 100,
      reasons: ["La manovra non è una rotatoria: nessun numero di uscita da calcolare."],
      warnings: [], candidates: [], roundabout: null,
      currentNames: namesFromLocate(locateResult?.[0]),
      targetNames: namesFromLocate(locateResult?.[1]),
    };
  }
  if (!routeResult) {
    return {
      predictedExit: null, confidence: "LOW", score: 0,
      reasons: ["Manca una risposta Valhalla per live o un fixture replay."],
      warnings: ["In live servono anche target lat/lon."],
      candidates: [], roundabout: null,
      currentNames: namesFromLocate(locateResult?.[0]),
      targetNames: namesFromLocate(locateResult?.[1]),
    };
  }

  const roundabout = findRoundaboutManeuver(routeResult);
  const currentNames = namesFromLocate(locateResult?.[0]);
  const targetNames = namesFromLocate(locateResult?.[1]);
  if (!roundabout) {
    return {
      predictedExit: null, confidence: "LOW", score: 0,
      reasons: ["Valhalla non ha restituito una manovra di rotatoria nel percorso."],
      warnings: ["Il percorso Valhalla potrebbe non coincidere con lo scenario Maps o con i dati OSM."],
      candidates: [], roundabout: null, currentNames, targetNames,
    };
  }

  const nextNames = [
    ...(roundabout.next?.street_names || []),
    ...(roundabout.next?.begin_street_names || []),
  ].filter(Boolean);
  const currentMatch = Math.max(0, ...currentNames.map((name) => roadNameSimilarity(scenario.currentRoad, name)));
  const targetMatch = Math.max(
    0,
    roadNameSimilarity(scenario.targetRoad, nextNames.join(" / ")),
    ...targetNames.map((name) => roadNameSimilarity(scenario.targetRoad, name))
  );
  const currentAccess = carAccessibleFromLocate(locateResult?.[0]);
  const targetAccess = carAccessibleFromLocate(locateResult?.[1]);
  const accessKnown = currentAccess !== null || targetAccess !== null;
  const accessOK = (currentAccess ?? true) && (targetAccess ?? true);
  const confidence = computeConfidence({
    targetMatch,
    currentMatch,
    carAccessKnown: accessKnown ? accessOK : null,
    exitFound: Number.isFinite(roundabout.exit),
  });

  const reasons = [
    `Uscita Valhalla: ${roundabout.exit ?? "non disponibile"}.`,
    `Strada successiva nel percorso Valhalla: ${nextNames.join(" / ") || "non identificata"}.`,
    `Match strada target Maps: ${Math.round(targetMatch * 100)}%.`,
    `Match strada corrente Maps: ${Math.round(currentMatch * 100)}%.`,
    `Accesso auto noto: ${accessKnown ? (accessOK ? "sì" : "no") : "non determinato"}.`,
  ];
  const warnings = [];
  if (!scenario.targetRoad) warnings.push("Target road vuota: la verifica semantica è più debole.");
  if (targetMatch < 0.5) warnings.push("Il nome della strada successiva non coincide bene con il percorso Valhalla.");
  if (accessKnown && !accessOK) warnings.push("Un punto non risulta accessibile alle auto secondo Valhalla.");

  return {
    predictedExit: roundabout.exit,
    confidence: confidence.level,
    score: confidence.score,
    reasons,
    warnings,
    candidates: buildCandidateRows(roundabout, scenario.targetRoad),
    roundabout,
    currentNames,
    targetNames,
    routeSummary: routeResult?.trip?.summary || null,
    fullRoute: routeResult,
  };
}

export function evaluateExpectedExit(result, expectedExit) {
  const expected = Number(expectedExit);
  if (!Number.isFinite(expected) || expected < 1) return null;
  if (!Number.isFinite(result?.predictedExit)) {
    return { tested: true, correct: false, reason: "Nessuna uscita predetta." };
  }
  return { tested: true, correct: result.predictedExit === expected, expected, predicted: result.predictedExit };
}
