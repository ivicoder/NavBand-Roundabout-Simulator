/**
 * RoundaboutResolver
 *
 * Nuovo resolver geometrico.
 *
 * In questa fase:
 * - riceve routeResult + locateResult reali;
 * - normalizza gli edge Valhalla;
 * - prepara il contesto della rotatoria;
 * - NON sostituisce ancora resolver.js;
 * - NON modifica ancora exit/confidence.
 */

export class RoundaboutResolver {
  constructor(options = {}) {
    this.options = options;
  }

  resolve(input) {
    if (!input) {
      throw new Error("RoundaboutResolver: input mancante");
    }

    const context = this.buildContext(input);

    return {
      exitNumber: null,
      score: 0,
      confidence: "LOW",

      currentRoad: context.currentRoad,
      nextRoad: context.nextRoad,

      currentEdges: context.currentEdges,
      targetEdges: context.targetEdges,

      roundabout: context.roundabout,

      reasons: [
        "geometric resolver context prepared"
      ]
    };
  }

  buildContext(input) {
    const currentEdges =
      this.normalizeLocateResult(input.locateResult?.[0]);

    const targetEdges =
      this.normalizeLocateResult(input.locateResult?.[1]);

    const roundabout =
      input.roundabout ?? null;

    return {
      currentRoad:
        input.currentRoad ??
        this.firstRoadName(currentEdges),

      nextRoad:
        input.nextRoad ??
        this.firstRoadName(targetEdges),

      currentEdges,
      targetEdges,
      roundabout
    };
  }

  normalizeLocateResult(result) {
    const items = Array.isArray(result)
      ? result
      : result
        ? [result]
        : [];

    const edges = [];

    for (const item of items) {
      for (const edge of item?.edges || []) {
        const normalized = this.normalizeEdge(edge);

        if (normalized) {
          edges.push(normalized);
        }
      }
    }

    return edges;
  }

  normalizeEdge(edge) {
    if (!edge || typeof edge !== "object") {
      return null;
    }

    const edgeInfo =
      edge.edge_info ?? {};

    const edgeData =
      edge.edge ?? {};

    const names =
      Array.isArray(edgeInfo.names)
        ? edgeInfo.names.filter(Boolean).map(String)
        : [];

    const access =
      edgeData.access ?? {};

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
        edgeData.use ??
        null,

      forward:
        edgeData.forward ??
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
      if (edge.names.length > 0) {
        return edge.names[0];
      }
    }

    return null;
  }

  enumerateRoundaboutExits(roundaboutEdges) {
    if (!Array.isArray(roundaboutEdges)) {
      return [];
    }

    return roundaboutEdges
      .map((edge) => this.normalizeEdge(edge))
      .filter(Boolean)
      .filter((edge) => edge.auto)
      .filter((edge) => !edge.roundabout);
  }
}

export default RoundaboutResolver;
