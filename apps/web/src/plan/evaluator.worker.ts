/// <reference lib="webworker" />
// Evaluates a draft plan off the main thread: the 2010 network with the player's edits applied,
// run through the calibrated demand model (skims → model → assignment → scorecard).
import type { DemandFile, Edit, Network, ZonesFile } from '@otc/shared';
import { applyEdits, evaluate, prepare, type DemandParams, type Prepared, type Scorecard } from '@otc/sim';

/** Score `baseEdits` (the network in operation: the 2010 network plus applied plans) and baseEdits + edits (the draft). */
export type ToWorker = { type: 'evaluate'; id: number; baseUrl: string; baseEdits: Edit[]; edits: Edit[] };
export type FromWorker =
  | { type: 'progress'; id: number; stage: string; f: number; baseline: boolean }
  | { type: 'result'; id: number; baseline: Scorecard; plan: Scorecard; seconds: number }
  | { type: 'error'; id: number; message: string };

interface Loaded {
  network: Network;
  zones: ZonesFile;
  car: Uint8Array;
  params: DemandParams;
  prep: Prepared | null;
  /** scored networks in operation, by their edits */
  baselines: Map<string, Scorecard>;
}

let loaded: Promise<Loaded> | null = null;

async function load(baseUrl: string): Promise<Loaded> {
  const get = (f: string) => fetch(`${baseUrl}data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return r;
  });
  const [network, zones, car, demand] = await Promise.all([
    get('network-2010.json').then((r) => r.json() as Promise<Network>),
    get('zones-2011.json').then((r) => r.json() as Promise<ZonesFile>),
    get('car-2011.bin').then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
    get('demand-2011.json').then((r) => r.json() as Promise<DemandFile>),
  ]);
  if (!demand.params) throw new Error('demand-2011.json has no calibrated parameters; rerun `pnpm --filter @otc/sim demand`');
  return { network, zones, car, params: demand.params as unknown as DemandParams, prep: null, baselines: new Map() };
}

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type !== 'evaluate') return;
  const { id } = msg;
  try {
    const t0 = performance.now();
    const L = await (loaded ??= load(msg.baseUrl));
    const inputs = (baseline: boolean) => ({
      zones: L.zones.zones, car: L.car, params: L.params, samples: 2,
      onProgress: (stage: string, f: number) => post({ type: 'progress', id, stage, f, baseline }),
    });
    L.prep ??= prepare({ zones: L.zones.zones, car: L.car, skims: null as never });
    const key = JSON.stringify(msg.baseEdits);
    let baseline = L.baselines.get(key);
    if (!baseline) {
      baseline = evaluate(applyEdits(L.network, msg.baseEdits), inputs(true), L.prep).score;
      L.baselines.set(key, baseline);
    }
    const plan = msg.edits.length ? evaluate(applyEdits(L.network, [...msg.baseEdits, ...msg.edits]), inputs(false), L.prep).score : baseline;
    post({ type: 'result', id, baseline, plan, seconds: (performance.now() - t0) / 1000 });
  } catch (e) {
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
};
