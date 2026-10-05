export class RoundaboutResolver {
  constructor(options = {}) {
    this.options = options;
  }

  resolve(input) {
    if (!input) {
      throw new Error("RoundaboutResolver: input mancante");
    }

    const context = this.buildContext(input);
    const exits = this.enumerateRoundaboutExits(context.roundaboutEdges);

    const scored = exits
      .map((exit, index) => ({
        ...exit,
        exitNumber: index + 1,
        matchScore: this.scoreRoadMatch(exit.names, context.nextRoad)
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    const best = scored[0] ?? null;
    const second = scored[1] ?? null;

    let confidence = "LOW";
    let score = best?.matchScore ?? 0;

    if (best && best.matchScore >= 80) {
      confidence = "HIGH";
    } else if (best && best.matchScore >= 50) {
      confidence = "MEDIUM";
    }

    const reasons = [];

    if (context.currentRoad) {
      reasons.push(`current road: ${context.currentRoad}`);
    }

    if (context.nextRoad) {
      reasons.push(`next road: ${context.nextRoad}`);
    }

    if (best) {
      reasons.push(
        `best exit ${best.exitNumber}: ${best.names.join(" / ") || "unnamed"}`
      );
    }

    if (second && best && best.matchScore === second.matchScore) {
      confidence = "LOW";
      reasons.push("ambiguous exit match");
    }

    return {
      exitNumber: best?.exitNumber ?? null,
      score,
      confidence,
      currentRoad: context.currentRoad,
      nextRoad: context.nextRoad,
      currentEdges: context.currentEdges,
      targetEdges: context.targetEdges,
      roundabout: context.roundabout,
      exits: scored,
      reasons
    };
  }

  buildContext(input) {
    const currentEdges = this.normalizeLocateResult(
      input.locateResult?.[0]
    );

    const targetEdges = this.normalizeLocateResult(
      input.locateResult?.[1]
    );

    const roundaboutEdges = this.normalizeRoundaboutEdges(
      input.roundaboutEdges ??
      input.roundabout?.edges ??
      []
    );

    return {
      currentRoad:
        input.currentRoad ??
        this.firstRoadName(currentEdges),

      nextRoad:
        input.nextRoad ??
        this.firstRoadName(targetEdges),

      currentEdges,
      targetEdges,

      roundabout:
        input.roundabout ?? null,

      roundaboutEdges
    };
  }

  normalizeLocateResult(result) {
    if (!result) return [];

    const edges = Array.isArray(result)
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

    const edgeInfo = edge.edge_info ?? {};
    const edgeData = edge.edge ?? {};

    const names = Array.isArray(edgeInfo.names)
      ? edgeInfo.names
          .filter(Boolean)
          .map(String)
      : [];

    const access = edgeData.access ?? {};

    return {
      id:
        edge.edge_id?.value ??
        edge.edge_id?.id ??
        edge.id ??
        null,

      wayId:
        edgeInfo.way_id ??
        edge.way_id ??
        null,

      names,

      shape:
        edgeInfo.shape ??
        null,

      roundabout:
        edgeData.round_about === true ||
        edgeData.roundabout === true,

      auto:
        access.car === true,

      use:
        edgeData.classification?.use ??
        edgeData.use ??
        null,

      classification:
        edgeData.classification?.classification ??
        null,

      forward:
        edgeData.forward ??
        null,

      startNode:
        edgeData.start_node ??
        null,

      endNode:
        edgeData.end_node ??
        null,

      correlatedLat:
        edge.correlated_lat ??
        null,

      correlatedLon:
        edge.correlated_lon ??
        null,

      percentAlong:
        edge.percent_along ??
        null
    };
  }

  firstRoadName(edges) {
    for (const edge of edges) {
      if (Array.isArray(edge.names) && edge.names.length) {
        return edge.names.join(" / ");
      }
    }

    return null;
  }

  enumerateRoundaboutExits(roundaboutEdges) {
    if (!Array.isArray(roundaboutEdges)) return [];

    return roundaboutEdges
      .filter(edge => edge.auto)
      .filter(edge => !edge.roundabout);
  }

  scoreRoadMatch(names, targetRoad) {
    if (!targetRoad || !Array.isArray(names) || !names.length) {
      return 0;
    }

    const target = this.normalizeRoadName(targetRoad);

    let best = 0;

    for (const name of names) {
      const candidate = this.normalizeRoadName(name);

      if (!candidate) continue;

      if (candidate === target) {
        best = Math.max(best, 100);
        continue;
      }

      const targetParts = target.split(" ");
      const candidateParts = candidate.split(" ");

      const common = targetParts.filter(
        part => candidateParts.includes(part)
      );

      if (common.length >= 2) {
        best = Math.max(best, 70);
      } else if (common.length === 1) {
        best = Math.max(best, 40);
      }
    }

    return best;
  }

  normalizeRoadName(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\/,.;()_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export default RoundaboutResolver;
