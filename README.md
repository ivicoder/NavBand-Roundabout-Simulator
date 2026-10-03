# NavBand Roundabout Simulator

Browser-based laboratory for testing the NavBand roundabout idea:

> Google Maps remains the primary navigator. Valhalla/OSM is used only to
> interpret the local road geometry and validate which roundabout exit matches
> the road that Maps indicates next.

## Main features

- GUI map with current/target points and route preview.
- Replay mode with bundled scenarios and no network dependency.
- Live mode using a configurable Valhalla HTTP API.
- Automobile (`auto`) costing.
- Current-road and target-road matching.
- Roundabout exit extraction via Valhalla `roundabout_exit_count` in baseline mode.
- Heuristic confidence score.
- Explanations and warnings.
- Raw JSON/debug view.
- Browser GPS helper.
- JSON scenario export.
- Dependency-free resolver tests.
- GitHub Pages deployment via GitHub Actions.

## Why this is not a second navigator

The intended NavBand design is:

Google Maps notification
→ current road + next road + maneuver/direction
→ NavBand roundabout resolver
→ Valhalla/OSM only when a roundabout needs interpretation
→ `roundaboutExit`
→ existing NavBand event pipeline
→ Mi Fitness
→ Smart Band 8

The route call in this v0.1 is a **baseline/oracle for testing**. It is not the
architecture we intend to use as the primary navigation engine.

## Current limitations

1. Maps itself is not read by this web app; its input is simulated.
2. Public Valhalla demo servers are fair-use/rate-limited.
3. Confidence is a heuristic score, not a probability.
4. Direct graph enumeration of every roundabout spoke is a future module.
5. OSM data can be incomplete/stale, so low confidence must be allowed.

## Local test

```bash
npm test
```

No build step is required for the web app.

## Official references

Valhalla Locate: https://valhalla.github.io/valhalla/api/locate/api-reference/
Valhalla Turn-by-Turn: https://valhalla.github.io/valhalla/api/turn-by-turn/overview/
GitHub Pages: https://docs.github.com/en/pages

See `SETUP_GITHUB.md` and `ARCHITECTURE.md` for the operational details.
