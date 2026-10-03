import assert from "node:assert/strict";
import { analyzeScenario, normalizeRoadName, roadNameSimilarity } from "../js/resolver.js";

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

console.log("All resolver tests passed.");
