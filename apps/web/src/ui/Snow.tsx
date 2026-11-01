import { useEffect, useRef } from 'react';

interface Props {
  active: boolean;
  night: boolean;
  /** draw a single still frame (screenshots, reduced motion) */
  still: boolean;
}

interface Flake {
  x: number;
  y: number;
  r: number;
  depth: number;
  drift: number;
}

/** Light falling snow, drawn on a canvas above the map (VISUAL_DESIGN §7). */
export function Snow({ active, night, still }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !active) return;
    const g = cv.getContext('2d')!;
    let raf = 0;
    let flakes: Flake[] = [];
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((innerWidth * innerHeight) / (night ? 3200 : 7000));
      flakes = Array.from({ length: count }, () => {
        const depth = rnd();
        return { x: rnd() * innerWidth, y: rnd() * innerHeight, r: 0.6 + depth * depth * 2.2, depth, drift: rnd() * Math.PI * 2 };
      });
    };
    const draw = (t: number) => {
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const f of flakes) {
        const a = (night ? 0.8 : 0.95) * (0.35 + f.depth * 0.65);
        if (!night) {
          g.fillStyle = `rgba(90,110,135,${a * 0.18})`;
          g.beginPath();
          g.arc(f.x + 0.6, f.y + 0.8, f.r * 1.3, 0, Math.PI * 2);
          g.fill();
        }
        const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.8);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(f.x, f.y, f.r * 1.8, 0, Math.PI * 2);
        g.fill();
        if (!still) {
          f.y += 0.25 + f.depth * 0.9;
          f.x += Math.sin(t / 1600 + f.drift) * 0.25 * (0.4 + f.depth);
          if (f.y > innerHeight + 4) {
            f.y = -4;
            f.x = rnd() * innerWidth;
          }
        }
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    resize();
    draw(0);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      g.clearRect(0, 0, cv.width, cv.height);
    };
  }, [active, night, still]);

  return <canvas ref={ref} className="snow" aria-hidden="true" />;
}
