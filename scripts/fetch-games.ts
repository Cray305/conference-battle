// Downloads FBS games from the CollegeFootballData API and saves the completed
// ones to data/seasons/{year}.json, one game per line so diffs stay readable.
// For the current season it also saves data/schedule.json: the week calendar,
// the AP polls, and the cross-conference games still to be played.
//
// Usage: bun scripts/fetch-games.ts [year | first-last]
// With no argument it fetches the current season, which runs from August
// through the January bowls. Requires CFBD_API_KEY (Bun loads .env automatically).

import { toScheduledGames, toSeasonGames, type CfbdGame, type Poll, type Schedule } from "../src/lib/data.ts";
import { currentSeason } from "../src/lib/season.ts";

const API = "https://api.collegefootballdata.com";

const key = process.env.CFBD_API_KEY;
if (!key) {
  console.error("CFBD_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

function parseYears(arg: string | undefined): number[] {
  if (!arg) return [currentSeason()];
  const m = /^(\d{4})(?:-(\d{4}))?$/.exec(arg);
  if (!m) throw new Error(`Expected a year like 2025 or a range like 2014-2025, got "${arg}".`);
  const first = Number(m[1]), last = Number(m[2] ?? m[1]);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`CFBD request for ${path} failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  return (await res.json()) as T;
}

interface CfbdWeek { week: number; seasonType: string; startDate: string; endDate: string; }
interface CfbdPollWeek { week: number; seasonType: string; polls: { poll: string; ranks: { rank: number; school: string }[] }[]; }

const phase = (seasonType: string): 0 | 1 => (seasonType === "postseason" ? 1 : 0);
const byWeek = (a: { phase: number; week: number }, b: { phase: number; week: number }) => a.phase - b.phase || a.week - b.week;

for (const year of parseYears(process.argv[2])) {
  const raw = await get<CfbdGame[]>(`/games?year=${year}&classification=fbs&seasonType=both`);
  const games = toSeasonGames(raw);
  const out = `data/seasons/${year}.json`;
  await Bun.write(out, `[\n${games.map((g) => JSON.stringify(g)).join(",\n")}\n]\n`);
  console.log(`Saved ${games.length} completed games to ${out}`);

  if (year !== currentSeason()) continue;
  const calendar = (await get<CfbdWeek[]>(`/calendar?year=${year}`))
    .filter((w) => w.seasonType === "regular" || w.seasonType === "postseason")
    .map((w) => ({ week: w.week, phase: phase(w.seasonType), start: w.startDate, end: w.endDate }))
    .sort(byWeek);
  const polls: Poll[] = (await get<CfbdPollWeek[]>(`/rankings?year=${year}`))
    .flatMap((w) => {
      const ap = w.polls.find((p) => p.poll === "AP Top 25");
      return ap ? [{ week: w.week, phase: phase(w.seasonType), ranks: Object.fromEntries(ap.ranks.map((r) => [r.school, r.rank])) }] : [];
    })
    .sort(byWeek);
  const upcoming = toScheduledGames(raw);
  const schedule: Schedule = { season: year, calendar, polls, upcoming };
  await Bun.write("data/schedule.json", `${JSON.stringify(schedule, null, 1)}\n`);
  console.log(`Saved ${calendar.length} weeks, ${polls.length} polls, and ${upcoming.length} upcoming games to data/schedule.json`);
}
