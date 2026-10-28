// Project Viking — the bike plan as pure data (from the Spartan bike-plan
// handoff). Ride codes and benchmark ids are frozen: logged rides and
// benchmark results key off them. The plan start date is the Viking start
// date in settings, so weeks, phases and deloads come from one place.
import type { PhaseKey, SessionKey } from './vikingData';

export const MAX_HR = 186;

export type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
export type Zone = { id: ZoneId; n: string; min: number; max: number; feel: string };
export const ZONES: Zone[] = [
  { id: 'Z1', n: 'Recovery', min: 0, max: 114, feel: 'Very easy, nose breathing' },
  { id: 'Z2', n: 'Endurance', min: 115, max: 135, feel: 'Can talk in full sentences' },
  { id: 'Z3', n: 'Tempo', min: 136, max: 150, feel: 'Short sentences only' },
  { id: 'Z4', n: 'Threshold', min: 151, max: 167, feel: 'A few words; hard but holdable 3–8 min' },
  { id: 'Z5', n: 'Max', min: 168, max: 186, feel: "Can't talk" },
];

export type RideCode = 'E1' | 'R1' | 'H1' | 'H2' | 'H3' | 'L1';
export type RideType = {
  code: RideCode; n: string; hard: boolean; min: [number, number];
  how: string; where: string;
  /** Target zones shown on the ride card. */
  zones: ZoneId[];
  /** Hidden before this phase (H3 sprints arrive in phase 2). */
  fromPhase2?: boolean;
};
export const RIDES: Record<RideCode, RideType> = {
  E1: { code: 'E1', n: 'Endurance', hard: false, min: [60, 90], zones: ['Z2'], how: 'All Z2. Cadence 80–90 rpm on flat ground.', where: 'Bike lane, Pos Chikito to the airport' },
  R1: { code: 'R1', n: 'Recovery spin', hard: false, min: [30, 45], zones: ['Z1'], how: 'Z1, light gear, no efforts.', where: 'Hotel-area loop' },
  H1: { code: 'H1', n: 'Hill repeats', hard: true, min: [50, 60], zones: ['Z2', 'Z4'], how: '15 min Z2 warm-up. 4–6 climbs of 3–4 min in Z4, easy back down 3–4 min. 10 min cool-down.', where: 'Alto Vista climbs or the bike-lane climb' },
  H2: { code: 'H2', n: 'Trail session', hard: true, min: [45, 75], zones: ['Z4', 'Z5'], how: 'Mixed intensity; push climbs (Z4–Z5), recover on flats. One skill focus per ride: cornering, braking or line choice.', where: 'Alto Vista trails (Tino Gei, Pica Piedra, Alto Vista south)' },
  H3: { code: 'H3', n: 'Sprints', hard: true, min: [45, 45], zones: ['Z5'], fromPhase2: true, how: '15 min warm-up. 8–10 × 30 s all-out, 2.5 min easy between. Cool-down.', where: "'Sprint to the top' segment or flat bike lane" },
  L1: { code: 'L1', n: 'Long ride', hard: false, min: [120, 150], zones: ['Z2', 'Z3'], how: 'Z2, short Z3 on climbs. Eat 30–60 g carbs per hour.', where: 'Bike lane plus trails' },
};
export const RIDE_CODES: RideCode[] = ['E1', 'R1', 'H1', 'H2', 'H3', 'L1'];

/** The 8-day cycle. It runs as a sequence: a day advances when it's done or
 *  skipped, never by the weekday. */
export type CycleDay = {
  day: number;
  gym: SessionKey | null;
  /** Ride options for the day; phase '1' may differ (day 7). */
  ride: RideCode[];
  ridePhase1?: RideCode[];
  optional?: boolean;
  optionalPhase1?: boolean;
  note?: string;
};
export const CYCLE: CycleDay[] = [
  { day: 1, gym: 'UA', ride: ['R1'], optional: true },
  { day: 2, gym: 'LA', ride: [] },
  { day: 3, gym: null, ride: ['H1', 'H2'], note: 'Hard ride' },
  { day: 4, gym: 'UB', ride: [] },
  { day: 5, gym: 'LB', ride: [] },
  { day: 6, gym: null, ride: ['E1'], note: 'Endurance' },
  { day: 7, gym: null, ride: ['H2', 'H3'], ridePhase1: ['R1'], optionalPhase1: true },
  { day: 8, gym: null, ride: [], note: 'Full rest. Skip this day when only 7 days are available.' },
];

export type BikePhase = { n: string; rides: [number, number]; hardCap: number; prog: string };
export const BIKE_PHASES: Record<PhaseKey, BikePhase> = {
  '1': { n: 'Foundation cut', rides: [3, 3], hardCap: 1, prog: 'Hill repeats start 4 × 3 min, +1 climb every 2 weeks up to 6 × 3 min. Endurance 60 → 90 min.' },
  '2': { n: 'Main cut', rides: [3, 4], hardCap: 2, prog: 'Hill repeats 5–6 × 4 min. Add H3 sprints. Endurance holds at 90 min.' },
  B: { n: 'Diet break', rides: [3, 4], hardCap: 2, prog: 'One L1 long ride. Best time to push distance.' },
  '3': { n: 'Finish cut', rides: [3, 3], hardCap: 2, prog: 'Same volume; chase benchmark times.' },
  '4': { n: 'Lean build', rides: [2, 3], hardCap: 2, prog: 'Drop one endurance ride if weight gain stalls. Keep one hard ride.' },
};

export const DELOAD_RULE = 'All rides Z1–Z2, max 60 min, no intervals.';
export const DELOAD_MAX_MIN = 60;
/** Rolling window for the hard-ride cap. */
export const HARD_WINDOW_DAYS = 8;

export const SHIFTS: Array<{ shift: string; win: string; note: string }> = [
  { shift: 'Morning 05:00–14:00', win: '16:30–18:30', note: 'Eat after the shift, before riding.' },
  { shift: 'Mid 13:00–22:00', win: '06:00–08:00', note: 'Small snack first.' },
  { shift: 'Night 21:00–05:00', win: 'Late afternoon, after sleep', note: 'Never ride hard straight off a night shift without sleep.' },
];
export const AVOID_WINDOW = '11:00–16:00 (heat)';

export type BenchId = 'aerobic' | 'climb' | 'cadence';
export type Benchmark = {
  id: BenchId; n: string; how: string; better: string;
  /** 'time' benchmarks record moving seconds (lower is better); 'rpm' records cadence. */
  kind: 'time' | 'rpm';
  base: { date: string; sec?: number; hr?: number; rpm?: number };
  target?: [number, number];
  /** HR cap for a valid result (the aerobic test). */
  hrCap?: number;
};
export const BENCHMARKS: Benchmark[] = [
  { id: 'aerobic', n: 'Aerobic test', kind: 'time', hrCap: 130, how: "Strava segment 'Fietspad Pos Chikito tot Airport' (6.3 km), HR at or under 130", better: 'Lower time at the same HR cap', base: { date: '2026-10-27', sec: 1246, hr: 118 } },
  { id: 'climb', n: 'Climb test', kind: 'time', how: "Strava segment 'Alto Vista south trail' (817 m), all-out", better: 'Lower time', base: { date: '2026-10-15', sec: 257, hr: 174 } },
  { id: 'cadence', n: 'Cadence', kind: 'rpm', how: 'Average cadence on E1 rides', better: 'Into the 80–90 rpm band', base: { date: '2026-10-27', rpm: 70 }, target: [80, 90] },
];

export const Z2_TARGET = { phase1: 120, later: 150 };
