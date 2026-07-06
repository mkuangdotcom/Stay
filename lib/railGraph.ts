import {
  DETOUR_FACTOR,
  haversineMeters,
  metersToWalkMinutes,
  walkMinutesEstimate,
} from "./geo";
import type { WalkEntry } from "./types";

/* Shapes of the JSON emitted by scripts/gtfs-ingest.ts */
export interface RailStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  route: string;
}

export interface RailLine {
  id: string;
  shortName: string;
  name: string;
  color: string;
  category: string;
  headwayMin: number;
  shape: [number, number][];
}

export interface RailData {
  lines: RailLine[];
  stations: RailStation[];
  /** feeder-bus routes (category "BUS"), same shape as rail lines */
  busLines?: RailLine[];
  /** feeder-bus stop dots for the map — [lng, lat] */
  busStops?: [number, number][];
}

export interface RailGraphData {
  headwayMinByRoute: Record<string, number>;
  nodes: Record<
    string,
    { name: string; lat: number; lng: number; route: string; kind?: "bus" }
  >;
  edges: [string, string, number, "ride" | "xfer"][];
}

/** The same graph without bus stops/edges — for commuting by rail alone. */
export function stripBus(data: RailGraphData): RailGraphData {
  const nodes = Object.fromEntries(
    Object.entries(data.nodes).filter(([, n]) => n.kind !== "bus")
  );
  return {
    headwayMinByRoute: data.headwayMinByRoute,
    nodes,
    edges: data.edges.filter(([a, b]) => nodes[a] && nodes[b]),
  };
}

interface Adj {
  to: string;
  secs: number;
  type: "ride" | "xfer";
}

export interface OfficeRouting {
  /** stationId -> seconds from station to office (ride + transfers + office-side walk) */
  dist: Map<string, number>;
  /** stationId -> previous hop toward the office, for path reconstruction */
  prev: Map<string, { node: string; type: "ride" | "xfer" } | null>;
  office: { lat: number; lng: number };
}

export interface CommuteLeg {
  type: "walk" | "ride" | "xfer";
  minutes: number;
  route?: string;
  from?: string;
  to?: string;
  stops?: number;
}

export interface Commute {
  totalMin: number;
  walkMin: number;
  boardStationId: string;
  boardStationName: string;
  walkRouted: boolean;
  legs: CommuteLeg[];
}

const MAX_OFFICE_WALK_MIN = 20;
const MAX_LISTING_WALK_MIN = 35;
const CANDIDATE_STATIONS = 4;
// with buses in the graph, look wider — nearby stops can crowd out the better rail option
const CANDIDATE_NODES_WITH_BUS = 8;
const CANDIDATE_RAIL_BACKUP = 2;

type NodeEntry = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  route: string;
  kind?: "bus";
};

export class RailGraph {
  private adj = new Map<string, Adj[]>();
  readonly nodes: RailGraphData["nodes"];
  readonly hasBus: boolean;
  private headways: Record<string, number>;
  private nodeList: NodeEntry[];

  constructor(data: RailGraphData) {
    this.nodes = data.nodes;
    this.nodeList = Object.entries(data.nodes).map(([id, n]) => ({ id, ...n }));
    this.hasBus = this.nodeList.some((n) => n.kind === "bus");
    this.headways = data.headwayMinByRoute;
    for (const [a, b, secs, type] of data.edges) {
      if (!data.nodes[a] || !data.nodes[b]) continue;
      let cost = secs;
      if (type === "xfer") {
        // waiting for the next train after a transfer: half the average headway
        const ha = this.headways[data.nodes[a].route] ?? 6;
        const hb = this.headways[data.nodes[b].route] ?? 6;
        cost += (((ha + hb) / 2) * 60) / 2;
      }
      this.addEdge(a, b, cost, type);
      this.addEdge(b, a, cost, type);
    }
  }

  private addEdge(from: string, to: string, secs: number, type: "ride" | "xfer") {
    if (!this.adj.has(from)) this.adj.set(from, []);
    this.adj.get(from)!.push({ to, secs, type });
  }

  headwayMin(route: string): number {
    return this.headways[route] ?? 6;
  }

  /** The `count` nearest stations within walking range (single pass, top-k). */
  nearestStations(lat: number, lng: number, count: number, maxWalkMin: number, railOnly = false) {
    const maxMeters = maxWalkMin / (metersToWalkMinutes(1) * DETOUR_FACTOR);
    const top: (NodeEntry & { meters: number })[] = [];
    for (const n of this.nodeList) {
      if (railOnly && n.kind === "bus") continue;
      const meters = haversineMeters(lat, lng, n.lat, n.lng);
      if (meters > maxMeters) continue;
      if (top.length === count && meters >= top[top.length - 1].meters) continue;
      let i = top.length;
      while (i > 0 && top[i - 1].meters > meters) i--;
      top.splice(i, 0, { ...n, meters });
      if (top.length > count) top.pop();
    }
    return top.map((s) => ({ ...s, walkMin: metersToWalkMinutes(s.meters * DETOUR_FACTOR) }));
  }

  /**
   * Multi-source Dijkstra seeded from every station walkable from the office.
   * Result maps each station to total seconds to reach the office from it.
   */
  routeToOffice(office: { lat: number; lng: number }): OfficeRouting {
    const dist = new Map<string, number>();
    const prev = new Map<string, { node: string; type: "ride" | "xfer" } | null>();
    const seeds = this.nearestStations(office.lat, office.lng, 6, MAX_OFFICE_WALK_MIN);

    // simple binary heap
    const heap: [number, string][] = [];
    const push = (d: number, id: string) => {
      heap.push([d, id]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): [number, string] | undefined => {
      if (heap.length === 0) return undefined;
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1,
            r = 2 * i + 2;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    for (const s of seeds) {
      const d = Math.round(s.walkMin * 60);
      dist.set(s.id, d);
      prev.set(s.id, null);
      push(d, s.id);
    }

    while (true) {
      const top = pop();
      if (!top) break;
      const [d, id] = top;
      if (d > (dist.get(id) ?? Infinity)) continue;
      for (const e of this.adj.get(id) ?? []) {
        const nd = d + e.secs;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, { node: id, type: e.type });
          push(nd, e.to);
        }
      }
    }

    return { dist, prev, office };
  }

  /**
   * Best commute from a point to the office: walk to a nearby station
   * (+ half-headway boarding wait) + precomputed rail time to office.
   */
  commuteFrom(
    lat: number,
    lng: number,
    routing: OfficeRouting,
    walkEntries?: WalkEntry[]
  ): Commute | null {
    const candidates = this.nearestStations(
      lat,
      lng,
      this.hasBus ? CANDIDATE_NODES_WITH_BUS : CANDIDATE_STATIONS,
      MAX_LISTING_WALK_MIN
    );
    if (this.hasBus) {
      // dense bus stops can fill every slot; always consider the nearest rail too
      for (const r of this.nearestStations(lat, lng, CANDIDATE_RAIL_BACKUP, MAX_LISTING_WALK_MIN, true)) {
        if (!candidates.some((c) => c.id === r.id)) candidates.push(r);
      }
    }
    let best: Commute | null = null;

    for (const c of candidates) {
      const railSecs = routing.dist.get(c.id);
      if (railSecs === undefined) continue;
      const cached = walkEntries?.find((w) => w.stationId === c.id);
      const walkMin = cached ? cached.walkMin : c.walkMin;
      const waitMin = this.headwayMin(this.nodes[c.id].route) / 2;
      const totalMin = walkMin + waitMin + railSecs / 60;
      if (!best || totalMin < best.totalMin) {
        best = {
          totalMin,
          walkMin,
          boardStationId: c.id,
          boardStationName: this.nodes[c.id].name,
          walkRouted: cached?.routed ?? false,
          legs: [],
        };
      }
    }

    // walking straight to the office can beat the train for nearby listings
    const directWalkMin = walkMinutesEstimate(lat, lng, routing.office.lat, routing.office.lng);
    if (directWalkMin <= MAX_LISTING_WALK_MIN && (!best || directWalkMin < best.totalMin)) {
      return {
        totalMin: directWalkMin,
        walkMin: directWalkMin,
        boardStationId: "",
        boardStationName: "",
        walkRouted: false,
        legs: [{ type: "walk", minutes: directWalkMin }],
      };
    }

    if (best) best.legs = this.buildLegs(best, routing);
    return best;
  }

  /** Reconstruct listing → office legs from the Dijkstra prev-chain. */
  private buildLegs(commute: Commute, routing: OfficeRouting): CommuteLeg[] {
    const legs: CommuteLeg[] = [
      { type: "walk", minutes: commute.walkMin, to: commute.boardStationName },
    ];

    // Walk the prev-chain from the boarding station down to an office seed.
    // prev points toward the office, so the chain is already in travel order.
    let cur = commute.boardStationId;
    let rideStart = cur;
    let rideSecsAccum = 0;
    let rideStops = 0;
    let lastRailSecs = routing.dist.get(cur)!;

    const flushRide = (endId: string) => {
      if (rideStops > 0) {
        legs.push({
          type: "ride",
          minutes: rideSecsAccum / 60,
          route: this.nodes[rideStart].route,
          from: this.nodes[rideStart].name,
          to: this.nodes[endId].name,
          stops: rideStops,
        });
      }
      rideSecsAccum = 0;
      rideStops = 0;
    };

    while (true) {
      const p = routing.prev.get(cur);
      if (p === null || p === undefined) break; // reached an office seed
      const nextRailSecs = routing.dist.get(p.node)!;
      const legSecs = lastRailSecs - nextRailSecs;
      if (p.type === "ride") {
        rideSecsAccum += legSecs;
        rideStops += 1;
      } else {
        flushRide(cur);
        legs.push({
          type: "xfer",
          minutes: legSecs / 60,
          to: this.nodes[p.node].name,
        });
        rideStart = p.node;
      }
      cur = p.node;
      lastRailSecs = nextRailSecs;
    }
    flushRide(cur);

    // office-side walk = whatever the seed cost was
    const seedWalkSecs = routing.dist.get(cur)!;
    legs.push({ type: "walk", minutes: seedWalkSecs / 60 });
    return legs;
  }
}
