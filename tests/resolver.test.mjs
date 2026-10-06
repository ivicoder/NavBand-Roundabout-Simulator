import assert from "node:assert/strict";
import { analyzeScenario, normalizeRoadName, roadNameSimilarity } from "../js/resolver.js";
import RoundaboutResolver from "../js/roundabout-resolver.js";

assert.equal(normalizeRoadName("Via Sant’Agostino"), "via sant agostino");
assert.equal(normalizeRoadName("VIA  Roma"), "via roma");
assert.equal(roadNameSimilarity("Via Roma", "Via Roma"), 1);
assert.ok(roadNameSimilarity("Via Sant'Agostino", "Via Sant’Agostino") > 0.8);

const scenario = { maneuver:"ROUNDABOUT", currentRoad:"Via Napoli", targetRoad:"Via Roma", expectedExit:2 };
const route = { trip:{ legs:[{ maneuvers:[
  { type:1, street_names:["Via Napoli"] },
  { type:26, street_names:["Rotatoria"] },
  { type:27, street_names:["Rotatoria"], roundabout_exit_count:2 },
  { type:10, street_names:["Via Roma"] }
]}]}};
const locate = [
  { edges:[{ edge_info:{ names:["Via Napoli"] }, edge:{ access:{car:true} } }] },
  { edges:[{ edge_info:{ names:["Via Roma"] }, edge:{ access:{car:true} } }] }
];
const result = analyzeScenario({ scenario, routeResult:route, locateResult:locate });
assert.equal(result.predictedExit, 2);
assert.equal(result.confidence, "HIGH");
assert.equal(result.score, 100);

const mismatch = analyzeScenario({
  scenario:{...scenario,targetRoad:"Via Torino"},
  routeResult:route, locateResult:locate
});
assert.equal(mismatch.predictedExit, 2);
assert.notEqual(mismatch.score, 100);
assert.ok(["MEDIUM","LOW"].includes(mismatch.confidence));

const geometricResolver =
  new RoundaboutResolver();

function realEdge(
  names,
  wayId,
  probeBearing,
  use = "road",
  classification = "tertiary"
) {
  return {
    names,
    wayId,
    edgeId: wayId,
    probeBearing,
    use,
    classification,
    auto: true,
    roundabout: false
  };
}

/*
 * B — radial probe reali acquisiti:
 * 48 probe / 8 edge.
 */
const radialB = [
  realEdge(
    ["Via degli Arazzi"],
    1025936167,
    0,
    "alley",
    "service_other"
  ),
  realEdge(
    ["Via Gennaro Papa", "SP210"],
    50639062,
    15
  ),
  realEdge(
    ["Via Catauli"],
    50638978,
    60,
    "road",
    "residential"
  ),
  realEdge(
    ["Via Generale Pasquale Tenga"],
    50638989,
    120
  ),
  realEdge(
    ["Via San Leucio", "SP336dir"],
    104034293,
    180
  ),
  realEdge(
    ["Vicolo A. Joli"],
    1025936159,
    165,
    "alley",
    "service_other"
  ),
  realEdge(
    ["Via Caprioli"],
    363324240,
    240,
    "road",
    "residential"
  ),
  realEdge(
    ["Viale degli Antichi Platani", "SP336-II"],
    1057563416,
    315
  )
];

const resultB =
  geometricResolver.resolve({
    currentRoad: "Via San Leucio",
    nextRoad: "Via Gennaro Papa",
    radialEdges: radialB,
    center: {
      lat: 41.09584649999999,
      lon: 14.318204888888891
    }
  });

assert.equal(resultB.predictedExit, 3);
assert.equal(resultB.exitNumber, 3);
assert.ok(resultB.score >= 85);
assert.equal(resultB.confidence, "HIGH");
assert.equal(resultB.roundabout.branches, 6);

/*
 * C — radial probe reali acquisiti:
 * 48 probe / 8 edge.
 */
const radialC = [
  realEdge(
    ["Via Gennaro Papa", "SP210"],
    50639062,
    0
  ),
  realEdge(
    ["Via Catauli"],
    50638978,
    45,
    "road",
    "residential"
  ),
  realEdge(
    ["Via Generale Pasquale Tenga"],
    50638989,
    120
  ),
  realEdge(
    ["Via San Leucio", "SP336dir"],
    104034293,
    180
  ),
  realEdge(
    ["Via Caprioli"],
    363324240,
    255,
    "road",
    "residential"
  ),
  realEdge(
    ["Viale degli Antichi Platani", "SP336-II"],
    1057563416,
    315
  ),
  realEdge(
    ["Via degli Arazzi"],
    1025936167,
    345,
    "alley",
    "service_other"
  ),
  realEdge(
    ["Vicolo A. Joli"],
    1025936159,
    165,
    "alley",
    "service_other"
  )
];

const resultC =
  geometricResolver.resolve({
    currentRoad: "Via San Leucio",
    nextRoad: "Via Catauli",
    radialEdges: radialC,
    center: {
      lat: 41.09575823076923,
      lon: 14.318288846153845
    }
  });

assert.equal(resultC.predictedExit, 2);
assert.equal(resultC.exitNumber, 2);
assert.ok(resultC.score >= 85);
assert.equal(resultC.confidence, "HIGH");
assert.equal(resultC.roundabout.branches, 6);

/*
 * D — radial probe reali acquisiti:
 * 48 probe / 7 edge.
 */
const radialD = [
  realEdge(
    ["Via degli Arazzi"],
    1025936167,
    0,
    "alley",
    "service_other"
  ),
  realEdge(
    ["Via Gennaro Papa", "SP210"],
    50639062,
    30
  ),
  realEdge(
    ["Via Catauli"],
    50638978,
    75,
    "road",
    "residential"
  ),
  realEdge(
    ["Via Generale Pasquale Tenga"],
    50638989,
    135
  ),
  realEdge(
    ["Via San Leucio", "SP336dir"],
    104034293,
    165
  ),
  realEdge(
    ["Via Caprioli"],
    363324240,
    240,
    "road",
    "residential"
  ),
  realEdge(
    ["Viale degli Antichi Platani", "SP336-II"],
    1057563416,
    300
  )
];

const resultD =
  geometricResolver.resolve({
    currentRoad: "Via San Leucio",
    nextRoad: "Via Caprioli",
    radialEdges: radialD,
    center: {
      lat: 41.09592403125,
      lon: 14.318081343749999
    }
  });

assert.equal(resultD.predictedExit, 5);
assert.equal(resultD.exitNumber, 5);
assert.ok(resultD.score >= 85);
assert.equal(resultD.confidence, "HIGH");
assert.equal(resultD.roundabout.branches, 6);

console.log("All resolver tests passed.");
