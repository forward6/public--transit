import type { LonLat } from '@otc/shared';

/**
 * The routable 2010 street + Transitway graph, for the design tools (M4): load the pipeline's
 * graph-2010.bin/.json, snap points to it, find the routes buses would take, and name stops
 * after their cross streets.
 */
export interface GraphMeta {
  version: 1;
  classes: string[];
  names: string[];
  speedKmh: Record<string, number>;
  routingCost: Record<string, number>;
  downtown: { box: [number, number, number, number]; kmh: number };
}

const KX = 111_320 * Math.cos((45.4 * Math.PI) / 180);
const KY = 110_950;

export class StreetGraph {
  readonly nNodes: number;
  readonly nEdges: number;
  readonly lon: Float32Array;
  readonly lat: Float32Array;
  readonly eu: Int32Array;
  readonly ev: Int32Array;
  readonly len: Float32Array;
  readonly cStart: Int32Array;
  readonly cLon: Float32Array;
  readonly cLat: Float32Array;
  readonly name: Uint16Array;
  readonly cls: Uint8Array;
  /** adjacency (CSR): edges at node n are adjEdge[adjStart[n] .. adjStart[n + 1]) */
  readonly adjStart: Int32Array;
  readonly adjEdge: Int32Array;
  /** routing cost and AM-peak bus seconds per edge */
  readonly cost: Float32Array;
  readonly sec: Float32Array;
  private readonly grid = new Map<number, number[]>();
  /** routing-cost multiplier per class index for local routes (keep off highways) */
  private readonly localPenalty: Float32Array;
  /** class indexes where buses don't stop (busways stop only at stations) */
  readonly fastClasses: Set<number>;
  private static readonly CELL = 250; // metres

  constructor(buf: ArrayBuffer, readonly meta: GraphMeta) {
    const h = new Uint32Array(buf, 0, 8);
    if (h[0] !== 0x4743544f) throw new Error('not an OTC street graph');
    const n = (this.nNodes = h[2]!);
    const e = (this.nEdges = h[3]!);
    const c = h[4]!;
    let o = 32;
    const f32 = (k: number) => {
      const a = new Float32Array(buf, o, k);
      o += 4 * k;
      return a;
    };
    const i32 = (k: number) => {
      const a = new Int32Array(buf, o, k);
      o += 4 * k;
      return a;
    };
    this.lon = f32(n);
    this.lat = f32(n);
    this.eu = i32(e);
    this.ev = i32(e);
    this.len = f32(e);
    this.cStart = i32(e + 1);
    this.cLon = f32(c);
    this.cLat = f32(c);
    this.name = new Uint16Array(buf, o, e);
    o += 2 * e;
    this.cls = new Uint8Array(buf, o, e);

    const deg = new Int32Array(n + 1);
    for (let k = 0; k < e; k++) {
      deg[this.eu[k]! + 1]!++;
      deg[this.ev[k]! + 1]!++;
    }
    this.adjStart = new Int32Array(n + 1);
    for (let k = 0; k < n; k++) this.adjStart[k + 1] = this.adjStart[k]! + deg[k + 1]!;
    this.adjEdge = new Int32Array(2 * e);
    const fill = this.adjStart.slice(0, n);
    for (let k = 0; k < e; k++) {
      this.adjEdge[fill[this.eu[k]!]!++] = k;
      this.adjEdge[fill[this.ev[k]!]!++] = k;
    }
    this.cost = new Float32Array(e);
    this.sec = new Float32Array(e);
    const [w, s, ea, no] = meta.downtown.box;
    for (let k = 0; k < e; k++) {
      const cname = meta.classes[this.cls[k]!]!;
      this.cost[k] = this.len[k]! * (meta.routingCost[cname] ?? 1.5);
      const mx = (this.lon[this.eu[k]!]! + this.lon[this.ev[k]!]!) / 2;
      const my = (this.lat[this.eu[k]!]! + this.lat[this.ev[k]!]!) / 2;
      const inDowntown = mx >= w && mx <= ea && my >= s && my <= no && cname !== 'busway';
      const kmh = inDowntown ? Math.min(meta.downtown.kmh, meta.speedKmh[cname] ?? 20) : (meta.speedKmh[cname] ?? 20);
      this.sec[k] = this.len[k]! / (kmh / 3.6);
    }
    this.localPenalty = Float32Array.from(meta.classes, (c) => ({ motorway: 6, link: 3, trunk: 1.3 } as Record<string, number>)[c] ?? 1);
    this.fastClasses = new Set(meta.classes.flatMap((c, i) => (['busway', 'motorway', 'trunk', 'link'].includes(c) ? [i] : [])));
    for (let k = 0; k < n; k++) {
      const key = this.cellKey(this.lon[k]!, this.lat[k]!);
      (this.grid.get(key) ?? this.grid.set(key, []).get(key)!).push(k);
    }
  }

  private cellKey(lon: number, lat: number, dx = 0, dy = 0): number {
    const x = Math.floor((lon * KX) / StreetGraph.CELL) + dx;
    const y = Math.floor((lat * KY) / StreetGraph.CELL) + dy;
    return x * 100003 + y;
  }

  /** Nearest node to a point (searching outwards up to ~2.5 km), or -1; `accept` limits it to nodes on some edge it accepts. */
  nearestNode(lon: number, lat: number, accept?: (edge: number) => boolean): number {
    let best = -1;
    let bd = Infinity;
    for (let r = 0; r <= 10 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const k of this.grid.get(this.cellKey(lon, lat, dx, dy)) ?? []) {
            if (accept && !this.edgesAt(k).some(accept)) continue;
            const d = Math.hypot((this.lon[k]! - lon) * KX, (this.lat[k]! - lat) * KY);
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
        }
      }
    }
    return best;
  }

  /** The edges meeting a node. */
  edgesAt(node: number): number[] {
    return Array.from(this.adjEdge.subarray(this.adjStart[node]!, this.adjStart[node + 1]!));
  }

  /** A street a streetcar can run on (not a highway, a ramp or the Transitway), and how much it would rather not (side streets). */
  tramFactor(edge: number): number {
    const c = this.meta.classes[this.cls[edge]!]!;
    return c === 'busway' || c === 'motorway' || c === 'trunk' || c === 'link' ? Infinity
      : c === 'primary' || c === 'secondary' ? 1 : c === 'tertiary' ? 1.15 : c === 'minor' ? 1.8 : 4;
  }

  other(edge: number, node: number): number {
    return this.eu[edge] === node ? this.ev[edge]! : this.eu[edge]!;
  }

  /**
   * Least-cost path between two nodes (Dijkstra, binary heap): the edges in order, or null.
   * 'local' routes keep off highways; 'express' routes may use them; a 'tram' takes the shortest way
   * along city streets, main streets first (never highways or the Transitway).
   */
  path(a: number, b: number, kind: 'local' | 'express' | 'tram' = 'local'): number[] | null {
    const penalty = kind === 'local' ? this.localPenalty : null;
    const tram = kind === 'tram';
    if (a === b) return [];
    const dist = new Float64Array(this.nNodes).fill(Infinity);
    const via = new Int32Array(this.nNodes).fill(-1);
    const heap = new MinHeap();
    dist[a] = 0;
    heap.push(0, a);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]!) continue;
      if (u === b) break;
      for (let j = this.adjStart[u]!; j < this.adjStart[u + 1]!; j++) {
        const e = this.adjEdge[j]!;
        const v = this.other(e, u);
        const nd = d + (tram ? this.len[e]! * this.tramFactor(e) : this.cost[e]! * (penalty ? penalty[this.cls[e]!]! : 1));
        if (!Number.isFinite(nd)) continue;
        if (nd < dist[v]!) {
          dist[v] = nd;
          via[v] = e;
          heap.push(nd, v);
        }
      }
    }
    if (!Number.isFinite(dist[b]!)) return null;
    const edges: number[] = [];
    for (let v = b; v !== a; ) {
      const e = via[v]!;
      edges.push(e);
      v = this.other(e, v);
    }
    return edges.reverse();
  }

  /** Coordinates of edge e walked from `from` (one of its end nodes), including both ends. */
  edgeCoords(e: number, from: number): LonLat[] {
    const pts: LonLat[] = [[this.lon[this.eu[e]!]!, this.lat[this.eu[e]!]!]];
    for (let k = this.cStart[e]!; k < this.cStart[e + 1]!; k++) pts.push([this.cLon[k]!, this.cLat[k]!]);
    pts.push([this.lon[this.ev[e]!]!, this.lat[this.ev[e]!]!]);
    return this.eu[e] === from ? pts : pts.reverse();
  }

  streetName(e: number): string | null {
    const i = this.name[e]!;
    return i ? this.meta.names[i]! : null;
  }

  /** A street meeting `node` other than `street` (for "Street / Cross" stop names). */
  crossName(node: number, street: string | null): string | null {
    for (let j = this.adjStart[node]!; j < this.adjStart[node + 1]!; j++) {
      const n = this.streetName(this.adjEdge[j]!);
      if (n && n !== street) return n;
    }
    return null;
  }

  degree(node: number): number {
    return this.adjStart[node + 1]! - this.adjStart[node]!;
  }
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const { k, v } = this;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r]! < k[l]! ? r : l;
        if (k[c]! >= lk) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}
