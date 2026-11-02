// Procedural textures used by the style (night-time lit windows on building walls).

export const WINDOW_IMAGES = { 'win-low': [0.22, 7], 'win-mid': [0.34, 11], 'win-high': [0.48, 17] } as const;
export type WindowImageId = keyof typeof WINDOW_IMAGES;

export function isWindowImage(id: string): id is WindowImageId {
  return id in WINDOW_IMAGES;
}

/** A 64×64 tile of building facade with a share of windows lit (deterministic per id). */
export function windowTexture(id: WindowImageId): ImageData {
  const [litShare, seed] = WINDOW_IMAGES[id];
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let x = seed * 9973;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  g.fillStyle = id === 'win-high' ? '#25324D' : id === 'win-mid' ? '#1F2A41' : '#1B2537';
  g.fillRect(0, 0, size, size);
  for (let yy = 3; yy < size; yy += 8) {
    for (let xx = 2; xx < size; xx += 6) {
      if (rnd() < litShare) {
        const warm = rnd() < 0.8;
        g.fillStyle = warm
          ? `rgba(255,${200 + Math.floor(rnd() * 40)},${120 + Math.floor(rnd() * 60)},${0.55 + rnd() * 0.45})`
          : `rgba(170,210,255,${0.45 + rnd() * 0.4})`;
      } else {
        g.fillStyle = 'rgba(90,110,150,0.18)';
      }
      g.fillRect(xx, yy, 3, 4);
    }
  }
  return g.getImageData(0, 0, size, size);
}

/** Diagonal red hatch marking land developed after 2010 (``?history=1`` review overlay). */
export function hatchTexture(): ImageData {
  const size = 16;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(215,38,61,0.10)';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(215,38,61,0.55)';
  g.lineWidth = 1.5;
  for (const o of [-size, 0, size]) {
    g.beginPath();
    g.moveTo(o, size);
    g.lineTo(o + size, 0);
    g.stroke();
  }
  return g.getImageData(0, 0, size, size);
}

/**
 * Oriented vehicle silhouette (front = top of the image): articulated buses are longer,
 * trains are two-car sets. Image ids look like `veh-<class>-<d|n>` (day / night).
 */
export function vehicleIcon(cls: string, color: string, night: boolean): ImageData {
  const train = cls === 'otrain' || cls === 'commuter';
  const w = train ? 18 : cls === 'local' || cls === 'rural' ? 14 : 16;
  const h = train ? 74 : cls === 'transitway' ? 44 : cls === 'local' || cls === 'rural' ? 30 : 36;
  const pad = 7;
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const g = c.getContext('2d')!;
  const rr = (x: number, y: number, ww: number, hh: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, ww, hh, r);
  };
  // contrast rings: dark outline, then white (day) / dark (night) border, so a vehicle stands out on its own line
  g.fillStyle = night ? 'rgba(255,255,255,0.85)' : 'rgba(20,33,58,0.9)';
  rr(pad - 4, pad - 4, w + 8, h + 8, 10);
  g.fill();
  g.fillStyle = night ? '#0B1220' : '#FFFFFF';
  rr(pad - 2.2, pad - 2.2, w + 4.4, h + 4.4, 8);
  g.fill();
  g.fillStyle = color;
  rr(pad, pad, w, h, 6);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.32)';
  rr(pad + w * 0.28, pad + 6, w * 0.44, h - 12, 3);
  g.fill();
  g.fillStyle = night ? 'rgba(255,250,225,0.95)' : 'rgba(20,33,58,0.55)';
  rr(pad + 2.5, pad + 2, w - 5, 5, 2);
  g.fill();
  if (cls === 'transitway') {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(pad + 1, pad + h * 0.55, w - 2, 1.6); // articulation joint
  }
  if (train) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(pad, pad + h / 2 - 1, w, 2);
  }
  return g.getImageData(0, 0, c.width, c.height);
}
