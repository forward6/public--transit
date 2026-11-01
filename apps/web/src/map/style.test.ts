import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { tileSchema } from '@otc/shared';
import { ALL_PALETTES } from './palettes';
import { buildStyle, nameExpr } from './style';

const base = { lang: 'en' as const, buildings3d: true, terrain: true, baseUrl: 'https://example.test/otc/' };
const glyphDir = fileURLToPath(new URL('../../public/glyphs/', import.meta.url));

describe('base-map style', () => {
  it.each(ALL_PALETTES.map((p) => [p.id, p]))('is a valid MapLibre style (%s)', (_id, palette) => {
    for (const buildings3d of [true, false]) {
      const errors = validateStyleMin(buildStyle({ ...base, palette, buildings3d }));
      expect(errors.map((e) => e.message)).toEqual([]);
    }
  });

  it('only uses source layers defined in the tile schema', () => {
    const style = buildStyle({ ...base, palette: ALL_PALETTES[0]! });
    const known = new Set(Object.keys(tileSchema.layers));
    for (const layer of style.layers) {
      if ('source-layer' in layer && layer['source-layer']) expect(known).toContain(layer['source-layer']);
    }
  });

  it('only uses fonts that have generated glyphs', () => {
    const style = buildStyle({ ...base, palette: ALL_PALETTES[0]! });
    const fonts = new Set<string>();
    for (const layer of style.layers) {
      if (layer.type === 'symbol') for (const f of (layer.layout?.['text-font'] as string[] | undefined) ?? []) fonts.add(f);
    }
    expect(fonts.size).toBeGreaterThan(2);
    for (const f of fonts) expect(existsSync(`${glyphDir}${f}/0-255.pbf`), f).toBe(true);
  });

  it('labels in the chosen language with a fallback', () => {
    expect(nameExpr('fr')).toEqual(['coalesce', ['get', 'name_fr'], ['get', 'name'], '']);
    const style = buildStyle({ ...base, lang: 'fr', palette: ALL_PALETTES[0]! });
    expect(JSON.stringify(style)).toContain('name_fr');
  });

  it('uses absolute data and glyph URLs under the base URL', () => {
    const style = buildStyle({ ...base, palette: ALL_PALETTES[0]! });
    expect(style.glyphs).toBe('https://example.test/otc/glyphs/{fontstack}/{range}.pbf');
    expect(JSON.stringify(style.sources)).toContain('pmtiles://https://example.test/otc/data/basemap-2010.pmtiles');
  });
});
