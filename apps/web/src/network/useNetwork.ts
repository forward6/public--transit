import { useEffect, useState } from 'react';
import type { Network } from '@otc/shared';
import { Playback } from '@otc/sim';

export interface NetworkState {
  network: Network;
  playback: Playback;
}

/** Load data/network-2010.json and prepare its timetable playback. */
export function useNetwork(baseUrl: string): NetworkState | null {
  const [state, setState] = useState<NetworkState | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}data/network-2010.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`network: HTTP ${r.status}`))))
      .then((network: Network) => {
        if (!cancelled) setState({ network, playback: new Playback(network) });
      })
      .catch((e) => console.warn('No network data yet — run `uv run otc-pipeline network`.', e));
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);
  return state;
}
