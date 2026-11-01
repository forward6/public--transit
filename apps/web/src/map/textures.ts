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
