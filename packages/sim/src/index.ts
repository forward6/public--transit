/**
 * @otc/sim — the OTC simulation core (pure TypeScript, no DOM).
 *
 * M2: weekday timetables and vehicle playback. Later milestones add demand, assignment,
 * operations, the civic layer and the economy (docs/PLAN.md §4).
 */
export const SIM_VERSION = '0.1.0';

export * from './geometry';
export * from './timetable';
export * from './playback';
export * from './raptor';
export * from './demand';
export * from './streetgraph';
export * from './plan';
export * from './evaluate';
export * from './economy';
export * from './weather';
export * from './opinion';
export * from './journey';
export * from './diary';
export * from './press';
export * from './game';
export * from './crowding';
export * from './onboard';
export * from './wards';
export * from './council';
