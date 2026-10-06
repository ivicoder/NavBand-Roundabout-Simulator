const DEFAULT_CLUSTER_DEGREES = 70;

export class RoundaboutResolver {
  constructor(options = {}) {
    this.options = {
      clusterDegrees:
        Number.isFinite(Number(options.clusterDegrees))
          ? Number(options.clusterDegrees)
          : DEFAULT_CLUSTER_DEGREES
    };
  }

  resolve(input) {
    if (!input) {
      throw new Error("RoundaboutResolver: input mancante");
    }

    const context = this.buildContext(input);

    const branches = this.buildBranches(
      context.radialEdges,
      context.center
    );

    if (!branches.length) {
      return this.emptyResult(
        context,
        "nessuna uscita geometrica disponibile"
      );
    }

    const entry = this.findEntryBranch(
      branches,
      context
    );

    const target = this.findTargetBranch(
      branches,
      context
    );

    const direction = this.inferDirection(
      context.routePoints
    );

    const entryBearing =
      context.currentBearing ??
      entry?.bearing ??
      null;

    const ordered = this.orderBranches(
      branches,
      entry,
      entryBearing,
      direction
    );

    const targetIndex = target
      ? ordered.findIndex(
          branch => branch.branchId === target.branchId
        )
      : -1;

    const exitNumber =
      targetIndex >= 0
        ? targetIndex + 1
        : null;

    const targetRoadScore =
      target?.roadScore ?? 0;

    const entryStrong =
      Boolean(
        context.currentBearing != null ||
        (
          entry &&
          entry.entryScore >= 500
        )
      );

    const targetStrong =
      Boolean(
        target &&
        targetRoadScore >= 100
      );

    let score = 0;

    if (branches.length) score += 25;
    if (entryStrong) score += 25;
    else if (entry) score += 15;

    if (targetRoadScore >= 100) score += 35;
    else if (targetRoadScore >= 82) score += 25;
    else if (targetRoadScore >= 40) score += 15;

    if (exitNumber != null) score += 15;

    score = Math.min(100, score);

    const confidence =
      score >= 85
        ? "HIGH"
        : score >= 65
          ? "MEDIUM"
          : "LOW";

    const reasons = [
      `radial edges: ${context.radialEdges.length}`,
      `geometric branches: ${branches.length}`,
      `traversal direction: ${
        direction < 0
          ? "decreasing-bearing"
          : "increasing-bearing"
      }`
    ];

    if (entry) {
      reasons.push(
        `entry: ${entry.names.join(" / ")}`
      );
    }

    if (target) {
      reasons.push(
        `target: ${target.names.join(" / ")}`
      );
    }

    if (targetStrong) {
      reasons.push("target road exact match");
    }

    if (exitNumber != null) {
      reasons.push(
        `geometric exit: ${exitNumber}`
      );
    }

    return {
      exitNumber,
      predictedExit: exitNumber,
      score,
      confidence,
      currentRoad: context.currentRoad,
      nextRoad: context.nextRoad,
      currentEdges: context.currentEdges,
      targetEdges: context.targetEdges,
      roundabout: {
        detected: true,
        center: context.center,
        radialEdges: context.radialEdges.length,
        branches: branches.length,
        traversalDirection:
          direction < 0
            ? "decreasing-bearing"
            : "increasing-bearing"
      },
      matchedRoad:
        target?.names?.join(" / ") || null,
      exits: ordered.map(
        (branch, index) => ({
          ...branch,
          exitNumber: index + 1
        })
      ),
      reasons,
      geometricResolver: true
    };
  }

  emptyResult(context, reason) {
    return {
      exitNumber: null,
      predictedExit: null,
      score: 0,
      confidence: "LOW",
      currentRoad: context.currentRoad,
      nextRoad: context.nextRoad,
      currentEdges: context.currentEdges,
      targetEdges: context.targetEdges,
      roundabout: {
        detected: false,
        center: context.center,
        radialEdges: 0,
        branches: 0
      },
      matchedRoad: null,
      exits: [],
      reasons: [reason],
      geometricResolver: true
    };
  }

  buildContext(input) {
    const currentEdges =
      this.normalizeLocateResult(
        input.currentEdges ??
        input.locateResult?.[0]
      );

    const targetEdges =
      this.normalizeLocateResult(
        input.targetEdges ??
        input.locateResult?.[1]
      );

    const radialEdges =
      this.normalizeRoundaboutEdges(
        input.radialEdges ??
        input.roundaboutEdges ??
        []
      );

    const center =
      this.normalizePoint(input.center);

    const currentBearing =
      center &&
      this.isFinitePoint(
        input.currentLat,
        input.currentLon
      )
        ? this.bearingFromCenter(
            center,
            {
              lat: Number(input.currentLat),
              lon: Number(input.currentLon)
            }
          )
        : null;

    const targetBearing =
      center &&
      this.isFinitePoint(
        input.targetLat,
        input.targetLon
      )
        ? this.bearingFromCenter(
            center,
            {
              lat: Number(input.targetLat),
              lon: Number(input.targetLon)
            }
          )
        : null;

    const routePoints =
      Array.isArray(input.routePoints)
        ? input.routePoints
            .map(point =>
              this.normalizePoint(point)
            )
            .filter(Boolean)
        : [];

    return {
      currentRoad:
        String(input.currentRoad ?? "").trim() ||
        this.firstRoadName(currentEdges),

      nextRoad:
        String(input.nextRoad ?? "").trim() ||
        this.firstRoadName(targetEdges),

      currentEdges,
      targetEdges,
      radialEdges,
      center,
      currentBearing,
      targetBearing,
      routePoints
    };
  }

  normalizeLocateResult(result) {
    if (!result) return [];

    const edges =
      Array.isArray(result)
        ? result
        : Array.isArray(result.edges)
          ? result.edges
          : [];

    return edges
      .map(edge => this.normalizeEdge(edge))
      .filter(Boolean);
  }

  normalizeRoundaboutEdges(edges) {
    if (!Array.isArray(edges)) return [];

    return edges
      .map(edge => this.normalizeEdge(edge))
      .filter(Boolean);
  }

  normalizeEdge(edge) {
    if (!edge) return null;

    const info = edge.edge_info ?? {};
    const data = edge.edge ?? {};
    const access = data.access ?? {};

    const names =
      Array.isArray(edge.names)
        ? edge.names.filter(Boolean).map(String)
        : Array.isArray(info.names)
          ? info.names.filter(Boolean).map(String)
          : [];

    return {
      id:
        edge.edgeId ??
        edge.edge_id?.value ??
        edge.edge_id?.id ??
        edge.id ??
        null,

      wayId:
        edge.wayId ??
        info.way_id ??
        edge.way_id ??
        null,

      names,

      roundabout:
        edge.roundabout === true ||
        data.round_about === true ||
        data.roundabout === true,

      auto:
        edge.auto != null
          ? edge.auto !== false
          : access.car !== false,

      use:
        edge.use ??
        data.classification?.use ??
        data.use ??
        null,

      classification:
        edge.classification ??
        data.classification?.classification ??
        null,

      correlatedLat:
        this.numberOrNull(
          edge.correlatedLat ??
          edge.correlated_lat
        ),

      correlatedLon:
        this.numberOrNull(
          edge.correlatedLon ??
          edge.correlated_lon
        ),

      probeBearing:
        this.numberOrNull(
          edge.probeBearing ??
          edge.probe_bearing
        )
    };
  }

  buildBranches(edges, center) {
    const usable =
      edges
        .filter(
          edge => edge.auto !== false
        )
        .filter(
          edge => !edge.roundabout
        )
        .filter(
          edge => !this.isExcludedUse(edge)
        )
        .filter(
          edge => edge.names.length
        )
        .map(edge => ({
          edge,
          bearing:
            this.edgeBearing(
              edge,
              center
            )
        }))
        .filter(
          item =>
            Number.isFinite(
              item.bearing
            )
        );

    const branches = [];

    for (const item of usable) {
      const candidate =
        branches.find(branch =>
          this.sameRoadFamily(
            branch.names,
            item.edge.names
          ) &&
          this.angularDistance(
            branch.bearing,
            item.bearing
          ) <= this.options.clusterDegrees
        );

      if (candidate) {
        candidate.members.push(item);

        candidate.bearing =
          this.circularMean(
            candidate.members.map(
              member =>
                member.bearing
            )
          );

        candidate.names =
          this.mergeNames(
            candidate.names,
            item.edge.names
          );

        if (
          item.edge.wayId != null &&
          !candidate.wayIds.includes(
            item.edge.wayId
          )
        ) {
          candidate.wayIds.push(
            item.edge.wayId
          );
        }
      } else {
        branches.push({
          branchId:
            `branch-${branches.length + 1}`,
          names:
            [...item.edge.names],
          wayIds:
            item.edge.wayId != null
              ? [item.edge.wayId]
              : [],
          bearing:
            item.bearing,
          members: [item]
        });
      }
    }

    return branches;
  }

  findEntryBranch(branches, context) {
    const currentWayIds =
      new Set(
        context.currentEdges
          .map(edge => edge.wayId)
          .filter(id => id != null)
          .map(String)
      );

    const currentBearing =
      context.currentBearing ??
      this.routeEdgeBearing(
        context.routePoints,
        context.center,
        false
      );

    const candidates =
      branches
        .map(branch => {
          const wayMatch =
            branch.wayIds.some(
              id =>
                currentWayIds.has(
                  String(id)
                )
            );

          const roadScore =
            this.scoreRoadMatch(
              branch.names,
              context.currentRoad
            );

          const angleScore =
            currentBearing == null
              ? 0
              : Math.max(
                  0,
                  100 -
                    this.angularDistance(
                      branch.bearing,
                      currentBearing
                    )
                );

          return {
            branch,
            wayMatch,
            roadScore,
            score:
              (wayMatch ? 1000 : 0) +
              roadScore * 5 +
              angleScore
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score
        );

    const best = candidates[0];

    if (!best) {
      return null;
    }

    if (
      !best.wayMatch &&
      best.roadScore === 0
    ) {
      return null;
    }

    best.branch.entryScore =
      best.score;

    best.branch.entryWayMatch =
      best.wayMatch;

    best.branch.entryRoadScore =
      best.roadScore;

    return best.branch;
  }

  findTargetBranch(branches, context) {
    const targetWayIds =
      new Set(
        context.targetEdges
          .map(edge => edge.wayId)
          .filter(
            id => id != null
          )
          .map(String)
      );

    const targetBearing =
      this.routeEdgeBearing(
        context.routePoints,
        context.center,
        true
      );

    const scored =
      branches
        .map(branch => {
          const wayMatch =
            branch.wayIds.some(
              id =>
                targetWayIds.has(
                  String(id)
                )
            );

          const roadScore =
            this.scoreRoadMatch(
              branch.names,
              context.nextRoad
            );

          const angleScore =
            targetBearing == null
              ? 0
              : Math.max(
                  0,
                  100 -
                    this.angularDistance(
                      branch.bearing,
                      targetBearing
                    )
                );

          return {
            branch,
            roadScore,
            score:
              (wayMatch ? 1000 : 0) +
              roadScore * 5 +
              angleScore
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score
        );

    const best = scored[0];

    if (!best) return null;

    best.branch.roadScore =
      best.roadScore;

    return best.branch;
  }

  orderBranches(
    branches,
    entry,
    entryBearing,
    direction
  ) {
    const entryId =
      entry?.branchId ?? null;

    const startBearing =
      entryBearing ??
      entry?.bearing ??
      0;

    return branches
      .filter(
        branch =>
          branch.branchId !== entryId
      )
      .map(branch => ({
        ...branch,
        traversalDistance:
          direction < 0
            ? this.ccwDistance(
                startBearing,
                branch.bearing
              )
            : this.cwDistance(
                startBearing,
                branch.bearing
              )
      }))
      .filter(
        branch =>
          branch.traversalDistance >
          0.001
      )
      .sort(
        (a, b) =>
          a.traversalDistance -
          b.traversalDistance
      );
  }

  inferDirection(routePoints) {
    if (
      !Array.isArray(routePoints) ||
      routePoints.length < 3
    ) {
      // Fallback per i test B/C/D:
      // la rotatoria reale validata è antioraria.
      return -1;
    }

    let total = 0;

    for (
      let i = 1;
      i < routePoints.length;
      i++
    ) {
      const a =
        this.bearingBetween(
          routePoints[i - 1],
          routePoints[i]
        );

      const b =
        this.bearingBetween(
          routePoints[i],
          routePoints[
            Math.min(
              routePoints.length - 1,
              i + 1
            )
          ]
        );

      const delta =
        this.normalizeSigned(
          b - a
        );

      if (
        Math.abs(delta) <= 120
      ) {
        total += delta;
      }
    }

    if (Math.abs(total) >= 10) {
      return total < 0 ? -1 : 1;
    }

    return -1;
  }

  routeEdgeBearing(
    points,
    center,
    last
  ) {
    if (
      !center ||
      !Array.isArray(points) ||
      !points.length
    ) {
      return null;
    }

    const point =
      last
        ? points[points.length - 1]
        : points[0];

    return this.bearingFromCenter(
      center,
      point
    );
  }

  scoreRoadMatch(names, targetRoad) {
    if (
      !targetRoad ||
      !names?.length
    ) {
      return 0;
    }

    const target =
      this.normalizeRoadName(
        targetRoad
      );

    let best = 0;

    for (const name of names) {
      const candidate =
        this.normalizeRoadName(
          name
        );

      if (!candidate) continue;

      if (candidate === target) {
        best = Math.max(
          best,
          100
        );
      } else if (
        candidate.includes(target) ||
        target.includes(candidate)
      ) {
        best = Math.max(
          best,
          82
        );
      } else {
        const common =
          target
            .split(" ")
            .filter(Boolean)
            .filter(
              token =>
                candidate
                  .split(" ")
                  .includes(token)
            );

        if (common.length >= 2) {
          best = Math.max(
            best,
            70
          );
        } else if (
          common.length === 1
        ) {
          best = Math.max(
            best,
            40
          );
        }
      }
    }

    return best;
  }

  isExcludedUse(edge) {
    const use =
      this.normalizeRoadName(
        edge.use
      );

    const classification =
      this.normalizeRoadName(
        edge.classification
      );

    return (
      use === "alley" ||
      use === "service" ||
      classification ===
        "service other"
    );
  }

  sameRoadFamily(
    namesA,
    namesB
  ) {
    for (const a of namesA) {
      const na =
        this.normalizeRoadName(a);

      if (!na) continue;

      for (const b of namesB) {
        const nb =
          this.normalizeRoadName(b);

        if (
          na === nb ||
          na.includes(nb) ||
          nb.includes(na)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  mergeNames(a, b) {
    const result = [
      ...a
    ];

    for (const name of b) {
      if (!result.includes(name)) {
        result.push(name);
      }
    }

    return result;
  }

  edgeBearing(edge, center) {
    if (
      Number.isFinite(
        edge.probeBearing
      )
    ) {
      return this.normalizeBearing(
        edge.probeBearing
      );
    }

    if (
      center &&
      Number.isFinite(
        edge.correlatedLat
      ) &&
      Number.isFinite(
        edge.correlatedLon
      )
    ) {
      return this.bearingFromCenter(
        center,
        {
          lat: edge.correlatedLat,
          lon: edge.correlatedLon
        }
      );
    }

    return null;
  }

  bearingBetween(a, b) {
    return this.bearingFromCenter(
      a,
      b
    );
  }

  bearingFromCenter(
    center,
    point
  ) {
    const lat1 =
      this.toRadians(
        center.lat
      );

    const lat2 =
      this.toRadians(
        point.lat
      );

    const deltaLon =
      this.toRadians(
        point.lon -
        center.lon
      );

    const y =
      Math.sin(deltaLon) *
      Math.cos(lat2);

    const x =
      Math.cos(lat1) *
        Math.sin(lat2) -
      Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(deltaLon);

    return this.normalizeBearing(
      this.toDegrees(
        Math.atan2(y, x)
      )
    );
  }

  circularMean(values) {
    if (!values.length) return 0;

    let x = 0;
    let y = 0;

    for (const value of values) {
      const rad =
        this.toRadians(value);

      x += Math.cos(rad);
      y += Math.sin(rad);
    }

    return this.normalizeBearing(
      this.toDegrees(
        Math.atan2(y, x)
      )
    );
  }

  angularDistance(a, b) {
    const diff =
      Math.abs(
        this.normalizeBearing(a) -
        this.normalizeBearing(b)
      );

    return Math.min(
      diff,
      360 - diff
    );
  }

  ccwDistance(from, to) {
    return this.normalizeBearing(
      from - to
    );
  }

  cwDistance(from, to) {
    return this.normalizeBearing(
      to - from
    );
  }

  normalizeSigned(value) {
    let result =
      Number(value) % 360;

    if (result > 180) {
      result -= 360;
    }

    if (result < -180) {
      result += 360;
    }

    return result;
  }

  normalizeBearing(value) {
    const result =
      Number(value) % 360;

    return result < 0
      ? result + 360
      : result;
  }

  normalizeRoadName(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[\/,.;()_'’-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  firstRoadName(edges) {
    for (const edge of edges) {
      if (edge.names?.length) {
        return edge.names.join(
          " / "
        );
      }
    }

    return null;
  }

  normalizePoint(point) {
    if (!point) return null;

    const lat =
      Number(point.lat);

    const lon =
      Number(point.lon);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }

    return { lat, lon };
  }

  isFinitePoint(lat, lon) {
    return (
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lon))
    );
  }

  numberOrNull(value) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }

  toRadians(value) {
    return (
      Number(value) *
      Math.PI /
      180
    );
  }

  toDegrees(value) {
    return (
      Number(value) *
      180 /
      Math.PI
    );
  }
}

export default RoundaboutResolver;
