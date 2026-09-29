import { CONFS, FCS, type Tier } from "./conferences.ts";
import type { CalendarWeek, Dataset, GameRow, Poll, ScheduledGame, WL } from "./data.ts";

type WeekRef = { phase: number; week: number };

/** Sort key for a week: regular-season weeks first, then the postseason. */
export const weekKey = (w: WeekRef) => w.phase * 100 + w.week;
const rowWeek = (g: GameRow): WeekRef => ({ phase: g[1] === 0 ? 0 : 1, week: g[8] });

/**
 * The calendar week the page features: the one in progress, the first one
 * before the season starts, or the last one once it's over.
 */
export function featuredWeek(calendar: CalendarWeek[], now: Date): CalendarWeek | undefined {
  const t = now.toISOString();
  return calendar.find((w) => w.end > t) ?? calendar.at(-1);
}

/** The AP poll teams took into a week. Bowl games use the last regular-season poll. */
export function pollFor(polls: Poll[], w: WeekRef): Record<string, number> {
  const before = polls.filter((p) => p.phase === 0 && (w.phase === 1 || p.week <= w.week));
  return before.at(-1)?.ranks ?? {};
}

const TIER: Record<Tier, number> = { P4: 3, Ind: 2, G5: 2, FCS: 1 };
const tier = (conf: number) => TIER[CONFS[conf]!.tier];

/** Higher for games worth watching: ranked teams first, then Power 4 against Power 4. */
export function interest(homeRank: number | undefined, awayRank: number | undefined, homeConf: number, awayConf: number): number {
  if (homeRank && awayRank) return 200 - homeRank - awayRank;
  if (homeRank || awayRank) return 100 - (homeRank ?? awayRank)!;
  return (tier(homeConf) + tier(awayConf)) * 5;
}

/** A game gets featured when a ranked team plays or two Power 4 teams meet. */
export const isFeatured = (score: number) => score >= 30;

/** An unranked team beating a ranked one, a lower-ranked team winning, or a lower tier beating a higher one. */
export function isUpset(winnerRank: number | undefined, loserRank: number | undefined, winnerConf: number, loserConf: number): boolean {
  if (loserRank) return !winnerRank || winnerRank > loserRank;
  return !winnerRank && tier(winnerConf) < tier(loserConf);
}

/** Indexes into ds.games of the cross-conference games played in one week of a season. */
export function playedInWeek(ds: Dataset, season: number, w: WeekRef): number[] {
  const out: number[] = [];
  ds.games.forEach((g, k) => {
    if (g[0] !== season || g[4] === g[5] || g[6] === g[7]) return;
    const gw = rowWeek(g);
    if (gw.phase === w.phase && gw.week === w.week) out.push(k);
  });
  return out;
}

export function scheduledInWeek(upcoming: ScheduledGame[], w: WeekRef): ScheduledGame[] {
  return upcoming.filter((g) => (g.phase === 0 ? 0 : 1) === w.phase && g.week === w.week);
}

/** The most recent week, up to and including `through`, with at least one result. */
export function lastPlayedWeek(ds: Dataset, season: number, calendar: CalendarWeek[], through: WeekRef): CalendarWeek | undefined {
  return calendar.filter((w) => weekKey(w) <= weekKey(through) && playedInWeek(ds, season, w).length).at(-1);
}

/** The first week, from `from` on, with a game still to play. */
export function nextScheduledWeek(upcoming: ScheduledGame[], calendar: CalendarWeek[], from: WeekRef): CalendarWeek | undefined {
  return calendar.find((w) => weekKey(w) >= weekKey(from) && scheduledInWeek(upcoming, w).length);
}

/** Each conference's wins and losses across a set of games. */
export function netByConference(ds: Dataset, games: number[]): Map<number, WL> {
  const net = new Map<number, WL>();
  const add = (c: number, won: boolean) => {
    const r = net.get(c) ?? { w: 0, l: 0 };
    if (won) r.w++; else r.l++;
    net.set(c, r);
  };
  for (const k of games) {
    const [, , , , hc, ac, hp, ap] = ds.games[k]!;
    add(hc, hp > ap);
    add(ac, ap > hp);
  }
  return net;
}

export interface Standing {
  conf: number;
  /** Record against other FBS conferences. */
  fbs: WL;
  /** Bowl and playoff record, which is also part of `fbs`. */
  post: WL;
  fcs: WL;
}

/**
 * One season's conference standings by record against other FBS conferences,
 * best first. Games against FCS teams are tracked but don't affect the order.
 * `skip` leaves games out, which is how the page finds last week's order.
 */
export function seasonStandings(ds: Dataset, season: number, skip?: (g: GameRow) => boolean): Standing[] {
  const rows = new Map<number, Standing>();
  const row = (c: number) => {
    let r = rows.get(c);
    if (!r) rows.set(c, (r = { conf: c, fbs: { w: 0, l: 0 }, post: { w: 0, l: 0 }, fcs: { w: 0, l: 0 } }));
    return r;
  };
  const tallyOne = (r: WL, won: boolean) => (won ? r.w++ : r.l++);
  for (const g of ds.games) {
    const [s, phase, , , hc, ac, hp, ap] = g;
    if (s !== season || hc === ac || hp === ap || skip?.(g)) continue;
    for (const [c, opp, won] of [[hc, ac, hp > ap], [ac, hc, ap > hp]] as const) {
      if (c === FCS) continue;
      const r = row(c);
      if (opp === FCS) { tallyOne(r.fcs, won); continue; }
      tallyOne(r.fbs, won);
      if (phase !== 0) tallyOne(r.post, won);
    }
  }
  const pct = (r: WL) => (r.w + r.l ? r.w / (r.w + r.l) : -1);
  return [...rows.values()].sort((a, b) => pct(b.fbs) - pct(a.fbs) || b.fbs.w - a.fbs.w || a.conf - b.conf);
}

/** How many places each conference moved when `after` replaced `before`; positive is up. */
export function movement(before: Standing[], after: Standing[]): Map<number, number> {
  const was = new Map(before.map((r, k) => [r.conf, k]));
  return new Map(after.map((r, k) => [r.conf, was.has(r.conf) ? was.get(r.conf)! - k : 0]));
}

export const inWeek = (w: WeekRef) => (g: GameRow) => weekKey(rowWeek(g)) === weekKey(w);
