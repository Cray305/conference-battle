import { CONFS, confFromCfbd, type ConfId } from "./conferences.ts";

/** The fields we read from a CollegeFootballData `/games` response. */
export interface CfbdGame {
  id: number;
  season: number;
  seasonType: string;
  startDate: string;
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
  phase: Phase;
  home: string;
  homeConf: ConfId;
  homePts: number;
  away: string;
  awayConf: ConfId;
  awayPts: number;
}

const CFP = /playoff|\bCFP\b|national championship/i;

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
    const phase: Phase = g.seasonType !== "postseason" ? 0 : CFP.test(g.notes ?? "") ? 2 : 1;
    out.push({
      id: g.id,
      date: g.startDate.slice(0, 10),
      phase,
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

/**
 * The file the page loads. Teams and conferences are stored as indexes to keep it small.
 * Each game is [season, phase, home, away, homeConf, awayConf, homePts, awayPts],
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
}
export type GameRow = [season: number, phase: Phase, home: number, away: number, homeConf: number, awayConf: number, homePts: number, awayPts: number];

const CONF_INDEX = new Map(CONFS.map((c, i) => [c.id, i]));

export function buildDataset(seasons: Map<number, SeasonGame[]>): Dataset {
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
    rows.push([season, g.phase, team(g.home, hc), team(g.away, ac), hc, ac, g.homePts, g.awayPts]);
  }
  // Drop games that are conference games under both membership views; they never count.
  const games = rows.filter((r) => r[4] !== r[5] || current[r[2]] !== current[r[3]]).reverse();

  return {
    first: years[0]!,
    last: years.at(-1)!,
    lastGame: all.at(-1)?.g.date ?? "",
    teams,
    current,
    games,
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

/** Head-to-head records for every pair of conferences: rec[a][b] is a's record against b. */
export function tally(ds: Dataset, f: Filters): Rec[][] {
  const n = CONFS.length;
  const rec: Rec[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => ({ w: 0, l: 0, reg: { w: 0, l: 0 }, post: { w: 0, l: 0 }, games: [] })));
  ds.games.forEach(([season, phase, home, away, hc, ac, hp, ap], k) => {
    if (season < f.from || season > f.to) return;
    if (f.phase === "reg" ? phase !== 0 : f.phase === "post" ? phase === 0 : false) return;
    const a = f.membership === "now" ? ds.current[home]! : hc;
    const b = f.membership === "now" ? ds.current[away]! : ac;
    if (a === b || hp === ap) return;
    const A = rec[a]![b]!, B = rec[b]![a]!;
    const aWon = hp > ap;
    const split = (r: Rec) => (phase === 0 ? r.reg : r.post);
    if (aWon) { A.w++; B.l++; split(A).w++; split(B).l++; }
    else { A.l++; B.w++; split(A).l++; split(B).w++; }
    A.games.push(k); B.games.push(k);
  });
  return rec;
}
