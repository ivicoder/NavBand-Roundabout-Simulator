# Architecture

## Phase 1 — laboratory

The simulator separates:

1. Maps input model: current road, target/next road, GPS, heading, maneuver.
2. Valhalla adapter: `/route`, `/locate`, configurable endpoint, optional key.
3. Resolver: roundabout detection, exit extraction, road matching, car-access check, confidence.
4. Scenario engine: replay fixtures and expected-exit evaluation.
5. GUI: map, editor, results, raw JSON.

## Confidence model v0.1

The score is a heuristic ranking, NOT a probability.

| Signal | Max |
|---|---:|
| Target/next road match | 45 |
| Current road match | 20 |
| Car access known/valid | 15 |
| Roundabout exit number present | 20 |
| Total | 100 |

Thresholds: HIGH >= 85, MEDIUM >= 65, LOW < 65.

## Baseline vs final resolver

For v0.1, when a target coordinate is provided, `/route` is a validation
baseline. Valhalla's `roundabout_exit_count` is used as the candidate. This
lets us validate the scenario engine before implementing direct graph
traversal.

The planned final resolver should map-match the current position/heading,
identify the roundabout edges, enumerate legal car exits, compare their road
names with the road indicated by Maps, and use geometry/heading only as a
tie-breaker.

## NavBand integration target

Keep the eventual integration small:

```js
resolveRoundabout({ currentLocation, heading, currentRoad, targetRoad, maneuver })
  -> { exit, confidence, score, reasons }
```

The app should never override Maps with a low-confidence guess.
