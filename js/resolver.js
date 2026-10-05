export const CONFIDENCE_THRESHOLDS = {
  HIGH: 85,
  MEDIUM: 65,
};

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

  if (aa.includes(bb) || bb.includes(aa)) {
    return 0.82;
  }

  const A = tokenSet(aa);
  const B = tokenSet(bb);

  const intersection = [...A].filter((token) => B.has(token)).length;
  const union = new Set([...A, ...B]).size || 1;

  return intersection / union;
}

export function namesFromLocate(result) {
  const names = [];

  const items = Array.isArray(result)
    ? result
    : result
      ? [result]
      : [];

  for (const item of items) {
    for (const edge of item?.edges || []) {
      for (const name of edge?.edge_info?.names || []) {
        if (name && !names.includes(name)) {
          names.push(name);
        }
      }
    }
  }

  return names;
}

export function carAccessibleFromLocate(result) {
  const access = [];

  const items = Array.isArray(result)
    ? result
    : result
      ? [result]
      : [];

  for (const item of items) {
    for (const edge of item?.edges || []) {
      if (typeof edge?.edge?.access?.car === "boolean") {
        access.push(edge.edge.access.car);
      }
    }
  }

  if (!access.length) {
    return null;
  }

  return access.some(Boolean);
}

function allManeuvers(routeResult) {
  return (routeResult?.trip?.legs || [])
    .flatMap((leg) => leg?.maneuvers || []);
}

export function collectManeuverRoadNames(maneuver) {
  const names = [
    ...(maneuver?.street_names || []),
    ...(maneuver?.begin_street_names || []),
  ]
    .filter(Boolean)
    .map(String);

  return [...new Set(names)];
}

export function findRoundaboutManeuver(routeResult) {
  const maneuvers = allManeuvers(routeResult);

  /*
   * Valhalla può rappresentare la rotatoria con più maneuver:
   *
   *   type 26 = ingresso
   *   type 27 = uscita
   *
   * Il roundabout_exit_count è quello che ci interessa.
   *
   * Quindi NON dobbiamo prendere semplicemente la prima maneuver
   * di tipo 26/27: dobbiamo cercare prima quella che contiene
   * effettivamente roundabout_exit_count.
   */

  let index = maneuvers.findIndex(
    (maneuver) =>
      Number.isFinite(
        Number(maneuver?.roundabout_exit_count)
      )
  );

  /*
   * Fallback: se il campo non è presente, troviamo comunque
   * una maneuver esplicitamente classificata come roundabout.
   */
  if (index < 0) {
    index = maneuvers.findIndex(
      (maneuver) =>
        maneuver?.type === 26 ||
        maneuver?.type === 27
    );
  }

  if (index < 0) {
    return null;
  }

  const roundabout = maneuvers[index];

  /*
   * Cerca la prima vera strada dopo la rotatoria.
   * Non assumiamo che sia la maneuver immediatamente successiva.
   */
  const searchLimit = Math.min(
    maneuvers.length,
    index + 13
  );

  let nextRoadManeuver = null;
  let nextRoadNames = [];

  for (let i = index + 1; i < searchLimit; i += 1) {
    const names = collectManeuverRoadNames(
      maneuvers[i]
    );

    if (names.length > 0) {
      nextRoadManeuver = maneuvers[i];
      nextRoadNames = names;
      break;
    }
  }

  /*
   * Fallback: il nome può essere presente direttamente
   * nella maneuver di uscita della rotatoria.
   */
  if (nextRoadNames.length === 0) {
    const ownNames = collectManeuverRoadNames(
      roundabout
    );

    if (ownNames.length > 0) {
      nextRoadManeuver = roundabout;
      nextRoadNames = ownNames;
    }
  }

  return {
    index,
    roundabout,
    next: nextRoadManeuver,
    nextRoadNames,
    exit:
      Number.isFinite(
        Number(roundabout?.roundabout_exit_count)
      )
        ? Number(roundabout.roundabout_exit_count)
        : null,
  };
}

export function buildCandidateRows(
  roundaboutInfo,
  targetRoad
) {
  const exit = roundaboutInfo?.exit;

  if (!Number.isFinite(exit)) {
    return [];
  }

  const nextNames =
    roundaboutInfo?.nextRoadNames || [];

  const road =
    nextNames[0] ||
    "Strada non identificata";

  const similarity = Math.max(
    0,
    ...nextNames.map((name) =>
      roadNameSimilarity(targetRoad, name)
    )
  );

  return [
    {
      exit,
      road,
      similarity,
      selected: true,
      score: Math.round(
        similarity * 70 + 30
      ),
    },
  ];
}

export function computeConfidence({
  targetMatch,
  currentMatch,
  carAccessKnown,
  exitFound,
  roundaboutFound,
  roadExtractionKnown,
}) {
  let score = 0;

  /*
   * La qualità geografica e quella del matching
   * testuale vengono tenute separate.
   */
  score += roundaboutFound ? 25 : 0;
  score += exitFound ? 25 : 0;

  score += Math.round(
    Math.max(
      0,
      Math.min(1, targetMatch)
    ) * 25
  );

  score += Math.round(
    Math.max(
      0,
      Math.min(1, currentMatch)
    ) * 10
  );

  score +=
    carAccessKnown === true
      ? 15
      : carAccessKnown === false
        ? 0
        : 7;

  /*
   * Se non siamo riusciti ad estrarre
   * una strada dopo la rotatoria,
   * non possiamo classificare il risultato
   * come HIGH.
   */
  if (!roadExtractionKnown) {
    score = Math.min(score, 65);
  }

  const level =
    score >= CONFIDENCE_THRESHOLDS.HIGH
      ? "HIGH"
      : score >= CONFIDENCE_THRESHOLDS.MEDIUM
        ? "MEDIUM"
        : "LOW";

  return {
    score,
    level,
  };
}

export function analyzeScenario({
  scenario,
  routeResult = null,
  locateResult = null,
}) {
  if (scenario.maneuver !== "ROUNDABOUT") {
    return {
      predictedExit: null,
      confidence: "HIGH",
      score: 100,
      reasons: [
        "La manovra non è una rotatoria: il resolver non deve decidere un numero di uscita.",
      ],
      warnings: [],
      candidates: [],
      roundabout: null,
      nextRoadNames: [],
      currentNames:
        namesFromLocate(locateResult?.[0]),
      targetNames:
        namesFromLocate(locateResult?.[1]),
    };
  }

  if (!routeResult) {
    return {
      predictedExit: null,
      confidence: "LOW",
      score: 0,
      reasons: [
        "Manca una risposta Valhalla per la modalità live oppure un fixture replay.",
      ],
      warnings: [
        "Fornisci anche un target lat/lon per usare il baseline /route.",
      ],
      candidates: [],
      roundabout: null,
      nextRoadNames: [],
      currentNames:
        namesFromLocate(locateResult?.[0]),
      targetNames:
        namesFromLocate(locateResult?.[1]),
    };
  }

  const roundabout =
    findRoundaboutManeuver(routeResult);

  if (!roundabout) {
    return {
      predictedExit: null,
      confidence: "LOW",
      score: 0,
      reasons: [
        "Valhalla non ha restituito un ingresso/uscita di rotatoria nel percorso analizzato.",
      ],
      warnings: [
        "Questo può indicare un percorso diverso da quello atteso o dati OSM differenti.",
      ],
      candidates: [],
      roundabout: null,
      nextRoadNames: [],
      currentNames:
        namesFromLocate(locateResult?.[0]),
      targetNames:
        namesFromLocate(locateResult?.[1]),
    };
  }

  const currentNames =
    namesFromLocate(locateResult?.[0]);

  const targetNames =
    namesFromLocate(locateResult?.[1]);

  const nextRoadNames =
    roundabout.nextRoadNames || [];

  const currentMatch = Math.max(
    0,
    ...currentNames.map((name) =>
      roadNameSimilarity(
        scenario.currentRoad,
        name
      )
    )
  );

  const targetMatch = Math.max(
    0,
    ...nextRoadNames.map((name) =>
      roadNameSimilarity(
        scenario.targetRoad,
        name
      )
    ),
    ...targetNames.map((name) =>
      roadNameSimilarity(
        scenario.targetRoad,
        name
      )
    )
  );

  const currentCarAccess =
    carAccessibleFromLocate(
      locateResult?.[0]
    );

  const targetCarAccess =
    carAccessibleFromLocate(
      locateResult?.[1]
    );

  const carAccessKnown =
    currentCarAccess !== null ||
    targetCarAccess !== null;

  const accessOK =
    (currentCarAccess ?? true) &&
    (targetCarAccess ?? true);

  const roadExtractionKnown =
    nextRoadNames.length > 0;

  const exitFound =
    Number.isFinite(roundabout.exit);

  const confidence =
    computeConfidence({
      targetMatch,
      currentMatch,
      carAccessKnown: carAccessKnown
        ? accessOK
        : null,
      exitFound,
      roundaboutFound: true,
      roadExtractionKnown,
    });

  const reasons = [
    `Uscita Valhalla: ${
      roundabout.exit ??
      "non disponibile"
    }.`,
    `Strada successiva nel percorso Valhalla: ${
      nextRoadNames.join(" / ") ||
      "non identificata"
    }.`,
    `Match strada target Maps: ${Math.round(
      targetMatch * 100
    )}%.`,
    `Match strada corrente Maps: ${Math.round(
      currentMatch * 100
    )}%.`,
    `Accesso auto noto: ${
      carAccessKnown
        ? accessOK
          ? "sì"
          : "no"
        : "non determinato"
    }.`,
  ];

  const warnings = [];

  if (!scenario.targetRoad) {
    warnings.push(
      "Target road vuota: la verifica semantica è più debole."
    );
  }

  if (!roadExtractionKnown) {
    warnings.push(
      "Valhalla ha trovato la rotatoria ma non è stata estratta una strada significativa nelle maneuver successive."
    );
  }

  if (
    targetMatch < 0.5 &&
    roadExtractionKnown
  ) {
    warnings.push(
      "Il nome della strada successiva non coincide bene con il percorso Valhalla."
    );
  }

  if (
    carAccessKnown &&
    !accessOK
  ) {
    warnings.push(
      "Un punto non risulta accessibile alle auto secondo Valhalla."
    );
  }

  return {
    predictedExit: roundabout.exit,
    confidence: confidence.level,
    score: confidence.score,
    reasons,
    warnings,
    candidates: buildCandidateRows(
      roundabout,
      scenario.targetRoad
    ),
    roundabout,
    nextRoadNames,
    currentNames,
    targetNames,
    routeSummary:
      routeResult?.trip?.summary || null,
    fullRoute: routeResult,
  };
}

export function evaluateExpectedExit(
  result,
  expectedExit
) {
  const expected = Number(
    expectedExit
  );

  if (
    !Number.isFinite(expected) ||
    expected < 1
  ) {
    return null;
  }

  if (
    !Number.isFinite(
      result?.predictedExit
    )
  ) {
    return {
      tested: true,
      correct: false,
      reason:
        "Nessuna uscita predetta.",
    };
  }

  return {
    tested: true,
    correct:
      result.predictedExit === expected,
    expected,
    predicted:
      result.predictedExit,
  };
}
