// OTC visual prototype — MapLibre style builder.
// One function, two palettes ("winter day" and "winter night"). The palette
// tokens here are the ones documented in docs/VISUAL_DESIGN.md.

export const PALETTES = {
  winterDay: {
    name: 'winterDay',
    land: '#EEF2F4',
    landTint: '#E7ECEF',
    park: '#D3E2D6',
    forest: '#C5D6CB',
    wetland: '#D8E3E3',
    campus: '#E9E7E3',
    water: '#9DBDD1',
    waterEdge: '#F6FAFC',
    waterEdgeWidth: 7,
    waterEdgeBlur: 6,
    skateway: '#E3EDF4',
    skatewayEdge: '#B7CCDB',
    stream: '#A9C4D6',
    roadFill: '#FFFFFF',
    roadCase: '#CBD3DA',
    roadMinor: '#FFFFFF',
    roadMinorCase: '#DCE2E7',
    rail: '#AEB7C0',
    roadGlow: null,
    bldLow: '#E3DED7',
    bldMid: '#D8D1C7',
    bldHigh: '#C9C0B4',
    bldOpacity: 0.96,
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.38, position: [1.35, 205, 38] },
    sky: {
      'sky-color': '#C9DCEA', 'horizon-color': '#F1F5F8', 'fog-color': '#EEF2F4',
      'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0,
    },
    transit: {
      brt: '#D7263D', otrain: '#25965A', frequent: '#2856B8', local: '#8794AB', sto: '#0B97A3',
      proposed_rail: '#8E3B9E', proposed_sto: '#0B97A3',
    },
    casing: '#FFFFFF',
    glow: false,
    stationFill: '#FFFFFF',
    vehicleStroke: '#FFFFFF',
  },
  summerDay: {
    name: 'summerDay',
    land: '#F3EFE7',
    landTint: '#EEE9E0',
    park: '#CDE2C0',
    forest: '#B9D5AB',
    wetland: '#CFE0D2',
    campus: '#EDE5D8',
    water: '#8DC1DB',
    waterEdge: '#C3E0EE',
    waterEdgeWidth: 4,
    waterEdgeBlur: 4,
    skateway: '#8DC1DB',
    skatewayEdge: '#B5D7E8',
    stream: '#9CCAE0',
    roadFill: '#FFFFFF',
    roadCase: '#DDD5C8',
    roadMinor: '#FFFFFF',
    roadMinorCase: '#E6DFD4',
    rail: '#B5AFA6',
    roadGlow: null,
    bldLow: '#E9E0D3',
    bldMid: '#DED1C0',
    bldHigh: '#CFBEA8',
    bldOpacity: 0.96,
    light: { anchor: 'viewport', color: '#FFF6E6', intensity: 0.4, position: [1.35, 215, 40] },
    sky: {
      'sky-color': '#BCDDF3', 'horizon-color': '#F4F1EA', 'fog-color': '#F3EFE7',
      'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0,
    },
    transit: {
      brt: '#D7263D', otrain: '#25965A', frequent: '#2856B8', local: '#8794AB', sto: '#0B97A3',
      proposed_rail: '#8E3B9E', proposed_sto: '#0B97A3',
    },
    casing: '#FFFFFF',
    glow: false,
    stationFill: '#FFFFFF',
    vehicleStroke: '#FFFFFF',
  },
  winterNight: {
    name: 'winterNight',
    land: '#0E1828',
    landTint: '#101B2C',
    park: '#0F2224',
    forest: '#0D1E20',
    wetland: '#0F1F27',
    campus: '#121E30',
    water: '#08192A',
    waterEdge: '#2A5677',
    waterEdgeWidth: 5,
    waterEdgeBlur: 5,
    skateway: '#BFD6E8',
    skatewayEdge: '#EAF4FF',
    stream: '#163450',
    roadFill: '#4A4232',
    roadCase: null,
    roadMinor: '#242A33',
    roadMinorCase: null,
    rail: '#2E3A4D',
    roadGlow: '#F5B260',
    bldLow: '#1A2438',
    bldMid: '#222E46',
    bldHigh: '#2E3C5C',
    bldOpacity: 1,
    light: { anchor: 'viewport', color: '#9FB7FF', intensity: 0.22, position: [1.2, 160, 50] },
    sky: {
      'sky-color': '#050A13', 'horizon-color': '#22304D', 'fog-color': '#0E1828',
      'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.55, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0,
    },
    transit: {
      brt: '#FF4A5C', otrain: '#38E08A', frequent: '#5F8DFF', local: '#7E8CA8', sto: '#22D4E2',
      proposed_rail: '#C77DFF', proposed_sto: '#22D4E2',
    },
    casing: null,
    glow: true,
    stationFill: '#0E1828',
    vehicleStroke: null,
  },
};

const D = '../data/';
const z = (...stops) => ['interpolate', ['exponential', 1.55], ['zoom'], ...stops];
const isPoly = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const isLine = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];

const ROAD_TIERS = [
  { id: 'minor', classes: ['residential', 'unclassified', 'living_street'], w: [12, 0.25, 14, 1.0, 16, 3.6] },
  { id: 'collector', classes: ['tertiary'], w: [12, 0.5, 14, 1.8, 16, 5.5] },
  { id: 'arterial', classes: ['primary', 'secondary'], w: [12, 0.9, 14, 2.8, 16, 8.5] },
  { id: 'highway', classes: ['motorway', 'trunk'], w: [12, 1.5, 14, 4.2, 16, 12] },
];

const KIND_W = {
  local: [12, 0.7, 14, 1.4, 16, 3.2],
  sto: [12, 1.5, 14, 3.0, 16, 6.5],
  frequent: [12, 1.7, 14, 3.2, 16, 7],
  brt: [12, 3.0, 14, 5.8, 16, 13],
  otrain: [12, 2.8, 14, 5.2, 16, 12],
  proposed_rail: [12, 2.0, 14, 3.6, 16, 8],
  proposed_sto: [12, 1.6, 14, 3.0, 16, 6],
};

function scaleStops(stops, k) {
  return stops.map((v, i) => (i % 2 === 1 ? (typeof k === 'number' ? v * k : ['*', v, k]) : v));
}

export function makeStyle(p, opts = {}) {
  const T = p.transit;
  const layers = [];
  const L = (l) => layers.push(l);

  L({ id: 'land', type: 'background', paint: { 'background-color': p.land } });

  // Natural land & parks
  L({ id: 'forest', type: 'fill', source: 'land', filter: ['==', ['get', 'subtype'], 'forest'],
    paint: { 'fill-color': p.forest, 'fill-opacity': 0.9 } });
  L({ id: 'wetland', type: 'fill', source: 'land', filter: ['==', ['get', 'subtype'], 'wetland'],
    paint: { 'fill-color': p.wetland, 'fill-opacity': 0.8 } });
  L({ id: 'campus', type: 'fill', source: 'landuse',
    filter: ['all', ['==', ['get', 'kind'], 'campus'], ['in', ['get', 'class'], ['literal', ['university', 'college', 'hospital']]]],
    paint: { 'fill-color': p.campus, 'fill-opacity': 0.9 } });
  L({ id: 'park', type: 'fill', source: 'landuse',
    filter: ['all', ['==', ['get', 'kind'], 'park'],
      ['in', ['get', 'class'], ['literal', ['park', 'garden', 'recreation_ground', 'cemetery', 'golf_course', 'nature_reserve', 'dog_park', 'stadium', 'village_green', 'grass']]]],
    paint: { 'fill-color': p.park, 'fill-opacity': 0.95 } });

  // Water: body, soft shore ice/edge, frozen canal (Skateway)
  L({ id: 'water', type: 'fill', source: 'water', filter: ['all', isPoly, ['!=', ['get', 'name'], 'Rideau Canal'], ['!=', ['get', 'subtype'], 'human_made']],
    paint: { 'fill-color': p.water } });
  L({ id: 'water-edge', type: 'line', source: 'water', filter: ['all', isPoly, ['!=', ['get', 'name'], 'Rideau Canal'], ['!=', ['get', 'subtype'], 'human_made']],
    paint: { 'line-color': p.waterEdge, 'line-width': z(12, p.waterEdgeWidth * 0.5, 16, p.waterEdgeWidth * 2.2), 'line-blur': z(12, p.waterEdgeBlur * 0.5, 16, p.waterEdgeBlur * 2.4), 'line-opacity': 0.75 } });
  L({ id: 'stream', type: 'line', source: 'water', filter: ['all', isLine, ['==', ['get', 'subtype'], 'stream']],
    paint: { 'line-color': p.stream, 'line-width': z(12, 0.6, 16, 2.2) } });
  L({ id: 'skateway', type: 'fill', source: 'water', filter: ['all', isPoly, ['==', ['get', 'name'], 'Rideau Canal']],
    paint: { 'fill-color': p.skateway } });
  L({ id: 'skateway-edge', type: 'line', source: 'water', filter: ['all', isPoly, ['==', ['get', 'name'], 'Rideau Canal']],
    paint: { 'line-color': p.skatewayEdge, 'line-width': z(12, 1, 16, p.glow ? 9 : 3), 'line-blur': p.glow ? z(12, 2, 16, 10) : 0, 'line-opacity': p.glow ? 0.8 : 1 } });

  // Planning overlay: travel-time bloom (hexagons) + today's 30-minute reach
  if (opts.bloom) {
    L({ id: 'bloom', type: 'fill', source: 'bloom',
      paint: { 'fill-color': ['match', ['get', 'band'], 10, '#0B6E78', 20, '#1F9A94', 30, '#6CC4A4', '#C9E7B8'],
        'fill-opacity': ['match', ['get', 'band'], 45, 0.42, 0.55] } });
    L({ id: 'bloom-edge', type: 'line', source: 'bloom',
      paint: { 'line-color': '#FFFFFF', 'line-width': 0.6, 'line-opacity': 0.55 } });
    L({ id: 'bloom-new', type: 'line', source: 'bloom', filter: ['==', ['get', 'new'], true],
      paint: { 'line-color': '#E39A12', 'line-width': 1.6 } });
    L({ id: 'bloom-before', type: 'line', source: 'bloomBefore',
      paint: { 'line-color': '#253552', 'line-width': 1.8, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });
  }

  // Roads
  for (const t of ROAD_TIERS) {
    const filt = ['in', ['get', 'class'], ['literal', t.classes]];
    if (p.roadGlow && t.id !== 'minor') {
      L({ id: `road-${t.id}-glow`, type: 'line', source: 'roads', filter: filt,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': p.roadGlow, 'line-width': z(...scaleStops(t.w, 3.2)), 'line-blur': z(...scaleStops(t.w, 3)),
          'line-opacity': t.id === 'highway' ? 0.16 : t.id === 'arterial' ? 0.12 : 0.07 } });
    }
    const cas = t.id === 'minor' ? p.roadMinorCase : p.roadCase;
    if (cas) {
      L({ id: `road-${t.id}-case`, type: 'line', source: 'roads', filter: filt,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': cas, 'line-width': z(...t.w.map((v, i) => (i % 2 ? v + (t.id === 'minor' ? 0.8 : 1.6) : v))) } });
    }
  }
  for (const t of ROAD_TIERS) {
    L({ id: `road-${t.id}`, type: 'line', source: 'roads', filter: ['in', ['get', 'class'], ['literal', t.classes]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': t.id === 'minor' ? p.roadMinor : p.roadFill, 'line-width': z(...t.w),
        'line-opacity': p.glow ? (t.id === 'minor' ? 0.9 : 0.85) : 1 } });
  }
  L({ id: 'rail', type: 'line', source: 'rail', filter: ['==', ['get', 'class'], 'standard_gauge'],
    paint: { 'line-color': p.rail, 'line-width': z(12, 0.8, 16, 2.2), 'line-dasharray': [3, 1.5] } });

  // Buildings (2.5D)
  const bh = ['coalesce', ['get', 'h'], 7];
  const bldIndex = layers.length;
  L({ id: 'buildings', type: 'fill-extrusion', source: 'buildings', minzoom: 12.5,
    paint: {
      ...(opts.windows
        ? { 'fill-extrusion-pattern': ['step', bh, 'win-low', 18, 'win-mid', 45, 'win-high'] }
        : { 'fill-extrusion-color': ['interpolate', ['linear'], bh, 0, p.bldLow, 25, p.bldMid, 90, p.bldHigh] }),
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.4, bh],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': p.bldOpacity,
      'fill-extrusion-vertical-gradient': true,
    } });

  // ---------- Transit network ----------
  const kinds = ['local', 'sto', 'frequent', 'proposed_sto', 'proposed_rail', 'brt', 'otrain'];
  const flow = opts.flow ? ['+', 0.55, ['*', 1.1, ['get', 'load']]] : 1;
  const widthOf = (k, mult = 1, add = 0) => {
    const f = opts.flow && !k.startsWith('proposed') ? ['*', mult, flow] : mult;
    return z(...KIND_W[k].map((v, i) => {
      if (i % 2 === 0) return v;
      const base = typeof f === 'number' ? v * f : ['*', v, f];
      return add ? (typeof base === 'number' ? base + add : ['+', base, add]) : base;
    }));
  };

  if (opts.selected) {
    L({ id: 'selected-halo', type: 'line', source: 'network', filter: ['==', ['get', 'name'], opts.selected],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': p.glow ? '#FFD27A' : '#FFC24B', 'line-width': z(12, 14, 16, 46), 'line-blur': z(12, 8, 16, 24), 'line-opacity': 0.55 } });
  }

  for (const k of kinds) {
    const filt = ['==', ['get', 'kind'], k];
    const color = T[k];
    const dashed = k.startsWith('proposed');
    if (p.glow) {
      L({ id: `net-${k}-glow2`, type: 'line', source: 'network', filter: filt, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': widthOf(k, 5), 'line-blur': widthOf(k, 4), 'line-opacity': k === 'local' ? 0.08 : dashed ? 0.1 : 0.22 } });
      L({ id: `net-${k}-glow1`, type: 'line', source: 'network', filter: filt, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': widthOf(k, 2.2), 'line-blur': widthOf(k, 1.4), 'line-opacity': k === 'local' ? 0.2 : 0.45 } });
    } else if (p.casing && !dashed) {
      L({ id: `net-${k}-case`, type: 'line', source: 'network', filter: filt, layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': p.casing, 'line-width': widthOf(k, 1, k === 'local' ? 1.4 : 3) } });
    }
    L({ id: `net-${k}`, type: 'line', source: 'network', filter: filt,
      layout: { 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' },
      paint: {
        'line-color': color,
        'line-width': widthOf(k),
        'line-opacity': (k === 'local' ? (p.glow ? 0.7 : 0.75) : dashed ? 0.85 : 1) * (opts.muted ? 0.45 : 1),
        ...(dashed ? { 'line-dasharray': [1.4, 1.1] } : {}),
      } });
    if (k === 'otrain' || k === 'brt') {
      // rail / busway "signature": a fine centre line so the modes differ by shape as well as colour
      L({ id: `net-${k}-centre`, type: 'line', source: 'network', filter: filt,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': p.glow ? '#FFFFFF' : '#FFFFFF', 'line-opacity': k === 'otrain' ? 0.95 : 0.55,
          'line-width': z(12, 0.6, 16, 2.2), ...(k === 'otrain' ? { 'line-dasharray': [1, 1.6] } : {}) } });
    }
  }

  // Vehicle trails (gradient per mode) and vehicles
  for (const k of opts.noVehicles ? [] : ['local', 'sto', 'frequent', 'brt', 'otrain']) {
    const c = T[k];
    L({ id: `trail-${k}`, type: 'line', source: 'trails', filter: ['==', ['get', 'kind'], k],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': z(12, k === 'otrain' ? 3 : 2, 16, k === 'otrain' ? 9 : 6),
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, hexA(c, 0), 0.7, hexA(c, p.glow ? 0.55 : 0.35), 1, hexA(p.glow ? lighten(c) : c, p.glow ? 0.95 : 0.7)],
        'line-blur': p.glow ? 1.5 : 0.5,
      } });
  }
  if (!opts.noVehicles && p.glow) {
    L({ id: 'veh-halo', type: 'circle', source: 'vehicles',
      paint: { 'circle-color': ['case', ['>', ['get', 'crowd'], 0.9], '#FFB347', ['get', 'vcolor']],
        'circle-radius': z(12, 5, 16, 22), 'circle-blur': 1, 'circle-opacity': ['case', ['>', ['get', 'crowd'], 0.9], 0.7, 0.5] } });
  }
  // Vehicles are oriented capsules (bus / train silhouettes) drawn at runtime — see app.js vehicleIcon()
  if (!opts.noVehicles) L({ id: 'veh', type: 'symbol', source: 'vehicles',
    layout: {
      'icon-image': ['concat', 'veh-', ['get', 'kind'], ['case', ['>', ['get', 'crowd'], 0.9], '-c', '-n']],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.42, 13, 0.55, 14, 0.7, 16, 1.25],
    } });

  // Stations
  L({ id: 'stations', type: 'circle', source: 'stations',
    paint: {
      'circle-color': p.stationFill,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, ['match', ['get', 'kind'], 'transfer', 6, 3.8], 16, ['match', ['get', 'kind'], 'transfer', 15, 10]],
      'circle-stroke-color': ['match', ['get', 'kind'], 'otrain', T.otrain, 'transfer', p.glow ? '#FFFFFF' : '#1B2A44', T.brt],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 1.8, 16, 3.6],
    } });

  if (opts.draft) {
    L({ id: 'draft-case', type: 'line', source: 'draft', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': z(12, 7, 16, 22) } });
    L({ id: 'draft-glow', type: 'line', source: 'draft', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': T.otrain, 'line-width': z(12, 14, 16, 40), 'line-blur': z(12, 10, 16, 30), 'line-opacity': 0.35 } });
    L({ id: 'draft', type: 'line', source: 'draft', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': T.otrain, 'line-width': z(12, 4.5, 16, 15) } });
    L({ id: 'draft-dash', type: 'line', source: 'draft', layout: { 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': z(12, 1.4, 16, 4), 'line-dasharray': [2, 2.2] } });
    L({ id: 'draft-stops', type: 'circle', source: 'draftStops',
      paint: { 'circle-color': '#FFFFFF', 'circle-radius': z(12, 6, 16, 16),
        'circle-stroke-color': ['case', ['get', 'existing'], '#1B2A44', T.otrain], 'circle-stroke-width': z(12, 2.6, 16, 5) } });
    L({ id: 'draft-handles', type: 'circle', source: 'draftHandles',
      paint: { 'circle-color': '#FFFFFF', 'circle-radius': z(12, 3.2, 16, 7), 'circle-stroke-color': '#E39A12', 'circle-stroke-width': 2 } });
  }

  if (opts.buildingsOnTop) {
    // Draw extrusions last so towers correctly hide the ground-level light behind them.
    const [bld] = layers.splice(bldIndex, 1);
    const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
    layers.splice(opts.vehiclesOverBuildings && firstSymbol >= 0 ? firstSymbol : layers.length, 0, bld);
  }

  return {
    version: 8,
    light: p.light,
    sky: p.sky,
    sources: {
      water: { type: 'geojson', data: D + 'water.geojson' },
      landuse: { type: 'geojson', data: D + 'landuse.geojson' },
      land: { type: 'geojson', data: D + 'land.geojson' },
      roads: { type: 'geojson', data: D + 'roads.geojson' },
      rail: { type: 'geojson', data: D + 'rail.geojson' },
      buildings: { type: 'geojson', data: D + 'buildings_min.geojson', buffer: 32 },
      network: { type: 'geojson', data: D + 'network.geojson' },
      trails: { type: 'geojson', data: D + 'trails.geojson', lineMetrics: true },
      vehicles: { type: 'geojson', data: opts.vehiclesData || D + 'vehicles.geojson' },
      stations: { type: 'geojson', data: D + 'stations.geojson' },
      ...(opts.bloom ? {
        bloom: { type: 'geojson', data: D + 'bloom.geojson' },
        bloomBefore: { type: 'geojson', data: D + 'bloom_before.geojson' },
      } : {}),
      ...(opts.draft ? {
        draft: { type: 'geojson', data: D + 'draft.geojson' },
        draftStops: { type: 'geojson', data: D + 'draft_stops.geojson' },
        draftHandles: { type: 'geojson', data: opts.draftHandles || { type: 'FeatureCollection', features: [] } },
      } : {}),
    },
    layers,
  };
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function lighten(hex, t = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(c + (255 - c) * t);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
