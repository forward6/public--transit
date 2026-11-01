import { useEffect, useState } from 'react';

export type Layout = 'phone' | 'tablet' | 'desktop';

/** Layout mode by viewport width (VISUAL_DESIGN §12): phone < 700 ≤ tablet < 1300 ≤ desktop. */
export function layoutFor(width: number): Layout {
  return width < 700 ? 'phone' : width < 1300 ? 'tablet' : 'desktop';
}

export function useLayout(forced?: Layout | null): Layout {
  const [layout, setLayout] = useState<Layout>(forced ?? layoutFor(window.innerWidth));
  useEffect(() => {
    if (forced) return;
    const onResize = () => setLayout(layoutFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [forced]);
  return forced ?? layout;
}
