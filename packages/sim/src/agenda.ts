import type { AgendaItem, GameEvent, GameState, ItemEffects, ItemKind } from '@otc/shared';

/** The vote event that brings an item before you (pauses the game). */
export const voteEvent = (item: AgendaItem, date: string): GameEvent =>
  ({ id: `vote-${item.id}-${date}`, kind: 'vote', date, decision: true, data: { item: item.id } });

/** Put an item on the agenda (mutates `s`). */
export function tableInto(s: GameState, kind: ItemKind, body: AgendaItem['body'], payload: AgendaItem['payload'], effects: ItemEffects, byChair = true,
  measuring = false): AgendaItem {
  const c = s.council!;
  const item: AgendaItem = { id: `${kind}-${s.date}-${c.items.length}`, kind, body, tabled: s.date, due: s.date, status: 'open', byChair, payload, effects,
    lobbied: [], ...(measuring ? { measuring } : {}) };
  c.items.push(item);
  s.events.push(voteEvent(item, s.date));
  return item;
}
