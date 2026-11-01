import { useEffect, useState } from 'react';
import type { DemandFile, Network, ZonesFile } from '@otc/shared';
import { Playback } from '@otc/sim';

export interface NetworkState {
  network: Network;
  playback: Playback;
  /** M3: the weekday demand model's results and its zones (absent until the pipeline has built them) */
  demand: DemandFile | null;
  zones: ZonesFile | null;
}

const getJson = <T,>(url: string): Promise<T | null> =>
  fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);

/** Load data/network-2010.json (plus the 2011 demand results, if built) and prepare the timetable playback. */
export function useNetwork(baseUrl: string): NetworkState | null {
  const [state, setState] = useState<NetworkState | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson<Network>(`${baseUrl}data/network-2010.json`),
      getJson<DemandFile>(`${baseUrl}data/demand-2011.json`),
      getJson<ZonesFile>(`${baseUrl}data/zones-2011.json`),
    ]).then(([network, demand, zones]) => {
      if (cancelled) return;
      if (!network) return console.warn('No network data yet — run `uv run otc-pipeline network`.');
      setState({ network, playback: new Playback(network), demand, zones });
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);
  return state;
}
