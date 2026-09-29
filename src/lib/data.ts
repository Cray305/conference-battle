import { CONFS, confFromCfbd, type ConfId } from "./conferences.ts";

/** The fields we read from a CollegeFootballData `/games` response. */
export interface CfbdGame {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  startTimeTBD?: boolean;
  neutralSite?: boolean;
  completed: boolean;
  notes?: string | null;
  homeTeam: string;
  homeConference?: string | null;
  homeClassification?: string | null;
  homePoints?: number | null;
  awayTeam: string;
  awayConference?: string | null;
  awayClassification?: string | null;
  awayPoints?: number | null;
}

/** 0 = regular season, 1 = bowl, 2 = College Football Playoff. */
export type Phase = 0 | 1 | 2;

/** One completed game as stored in data/seasons/{year}.json. */
export interface SeasonGame {
  id: number;
  date: string;
  /** CFBD week number. Postseason games restart at week 1, so read it with phase. */
  week: number;
  phase: Phase;
  home: string;
  homeConf: ConfId;
  homePts: number;
  away: string;
  awayConf: ConfId;
  awayPts: number;
}

const CFP = /playoff|\bCFP\b|national championship/i;
const phaseOf = (g: CfbdGame): Phase => (g.seasonType !== "postseason" ? 0 : CFP.test(g.notes ?? "") ? 2 : 1);

/**
 * Keeps completed games between two FBS or FCS teams and records each team's
 * conference as of that game. Games against Division II and III teams are dropped.
 */
export function toSeasonGames(games: CfbdGame[]): SeasonGame[] {
  const out: SeasonGame[] = [];
  for (const g of games) {
    if (!g.completed || g.homePoints == null || g.awayPoints == null) continue;
    const homeConf = confFromCfbd(g.homeClassification, g.homeConference);
    const awayConf = confFromCfbd(g.awayClassification, g.awayConference);
    if (!homeConf || !awayConf) continue;
    out.push({
      id: g.id,
      date: g.startDate.slice(0, 10),
      week: g.week,
      phase: phaseOf(g),
      home: g.homeTeam,
      homeConf,
      homePts: g.homePoints,
      away: g.awayTeam,
      awayConf,
      awayPts: g.awayPoints,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

/** A game that hasn't been played yet, between teams from different conferences. */
export interface ScheduledGame {
  id: number;
  week: number;
  phase: Phase;
  /** Kickoff as an ISO timestamp. When `tbd` is set only the date is known. */
  start: string;
  tbd: boolean;
  neutral: boolean;
  /** The bowl or playoff game's name, when it has one. */
  name?: string;
  home: string;
  homeConf: ConfId;
  away: string;
  awayConf: ConfId;
}

/** One week of the CFBD calendar. Weeks run Monday to Monday, Pacific time. */
export interface CalendarWeek {
  week: number;
  /** 0 for the regular season, 1 for the postseason. */
  phase: 0 | 1;
  start: string;
  end: string;
}

/** An AP poll, as school name to rank. Poll week N ranks teams going into week N. */
export interface Poll {
  week: number;
  phase: 0 | 1;
  ranks: Record<string, number>;
}

/** data/schedule.json: the current season's calendar, polls, and unplayed cross-conference games. */
export interface Schedule {
  season: number;
  calendar: CalendarWeek[];
  polls: Poll[];
  upcoming: ScheduledGame[];
}

/** Keeps unplayed games between two known conferences that aren't conference games. */
export function toScheduledGames(games: CfbdGame[]): ScheduledGame[] {
  const out: ScheduledGame[] = [];
  for (const g of games) {
    if (g.completed) continue;
    const homeConf = confFromCfbd(g.homeClassification, g.homeConference);
    const awayConf = confFromCfbd(g.awayClassification, g.awayConference);
    if (!homeConf || !awayConf || homeConf === awayConf) continue;
    const phase = phaseOf(g);
    out.push({
      id: g.id,
      week: g.week,
      phase,
      start: g.startDate,
      tbd: !!g.startTimeTBD,
      neutral: !!g.neutralSite,
      ...(phase && g.notes ? { name: g.notes } : {}),
      home: g.homeTeam,
      homeConf,
      away: g.awayTeam,
      awayConf,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
}

/**
 * The file the page loads. Teams and conferences are stored as indexes to keep it small.
 * Each game is [season, phase, home, away, homeConf, awayConf, homePts, awayPts, week],
 * newest first.
 */
export interface Dataset {
  first: number;
  last: number;
  lastGame: string;
  teams: string[];
  /** Each team's conference in its most recent game, used for the "current membership" view. */
  current: number[];
  games: GameRow[];
  /** The current season's schedule, when data/schedule.json exists. */
  schedule?: Schedule;
  /** CFBD ids for team logos, by school name, for the teams the page shows. */
  logos: Record<string, number>;
}
export type GameRow = [season: number, phase: Phase, home: number, away: number, homeConf: number, awayConf: number, homePts: number, awayPts: number, week: number];

const CONF_INDEX = new Map(CONFS.map((c, i) => [c.id, i]));

export function buildDataset(seasons: Map<number, SeasonGame[]>, schedule?: Schedule, logoIds: Record<string, number> = {}): Dataset {
  const years = [...seasons.keys()].sort((a, b) => a - b);
  if (!years.length) throw new Error("No season data found in data/seasons/. Run `bun run fetch-data` first.");
  const all = years.flatMap((season) => seasons.get(season)!.map((g) => ({ season, g })));

  const teams: string[] = [];
  const teamIndex = new Map<string, number>();
  const current: number[] = [];
  const team = (name: string, conf: number) => {
    let i = teamIndex.get(name);
    if (i === undefined) { i = teams.push(name) - 1; teamIndex.set(name, i); }
    current[i] = conf; // games are in date order, so the last write is the most recent
    return i;
  };

  const rows: GameRow[] = [];
  for (const { season, g } of all) {
    const hc = CONF_INDEX.get(g.homeConf)!, ac = CONF_INDEX.get(g.awayConf)!;
    rows.push([season, g.phase, team(g.home, hc), team(g.away, ac), hc, ac, g.homePts, g.awayPts, g.week]);
  }
  // Conference games stay in so a team's row can show its conference record;
  // the conference matrix skips them in tally().
  const games = rows.reverse();

  const shown = new Set([...teams, ...(schedule?.upcoming.flatMap((g) => [g.home, g.away]) ?? [])]);
  const logos = Object.fromEntries(Object.entries(logoIds).filter(([name]) => shown.has(name)));

  return {
    first: years[0]!,
    last: years.at(-1)!,
    lastGame: all.at(-1)?.g.date ?? "",
    teams,
    current,
    games,
    ...(schedule ? { schedule } : {}),
    logos,
  };
}

export interface WL { w: number; l: number; }
export interface Rec extends WL {
  reg: WL;
  post: WL;
  /** Indexes into Dataset.games, newest first. */
  games: number[];
}

export interface Filters {
  from: number;
  to: number;
  phase: "all" | "reg" | "post";
  membership: "then" | "now";
}

const emptyRec = (): Rec => ({ w: 0, l: 0, reg: { w: 0, l: 0 }, post: { w: 0, l: 0 }, games: [] });

const inFilters = (f: Filters, season: number, phase: Phase) =>
  season >= f.from && season <= f.to && (f.phase === "reg" ? phase === 0 : f.phase === "post" ? phase !== 0 : true);

function count(r: Rec, won: boolean, phase: Phase, k: number) {
  const split = phase === 0 ? r.reg : r.post;
  if (won) { r.w++; split.w++; } else { r.l++; split.l++; }
  r.games.push(k);
}

/** Head-to-head records for every pair of conferences: rec[a][b] is a's record against b. */
export function tally(ds: Dataset, f: Filters): Rec[][] {
  const n = CONFS.length;
  const rec: Rec[][] = Array.from({ length: n }, () => Array.from({ length: n }, emptyRec));
  ds.games.forEach(([season, phase, home, away, hc, ac, hp, ap], k) => {
    if (!inFilters(f, season, phase)) return;
    const a = f.membership === "now" ? ds.current[home]! : hc;
    const b = f.membership === "now" ? ds.current[away]! : ac;
    if (a === b || hp === ap) return;
    count(rec[a]![b]!, hp > ap, phase, k);
    count(rec[b]![a]!, ap > hp, phase, k);
  });
  return rec;
}

/**
 * One team's record against every conference: rec[j] is the team's record against j.
 * Games against its own conference count, so that cell is its conference record.
 */
export function tallyTeam(ds: Dataset, f: Filters, team: number): Rec[] {
  const rec = CONFS.map(emptyRec);
  ds.games.forEach(([season, phase, home, away, hc, ac, hp, ap], k) => {
    if ((home !== team && away !== team) || hp === ap || !inFilters(f, season, phase)) return;
    const isHome = home === team;
    const opp = f.membership === "now" ? ds.current[isHome ? away : home]! : isHome ? ac : hc;
    count(rec[opp]!, isHome === hp > ap, phase, k);
  });
  return rec;
}
