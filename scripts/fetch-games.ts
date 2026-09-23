// Downloads FBS games from the CollegeFootballData API and saves the completed
// ones to data/seasons/{year}.json, one game per line so diffs stay readable.
//
// Usage: bun scripts/fetch-games.ts [year | first-last]
// With no argument it fetches the current season, which runs from August
// through the January bowls. Requires CFBD_API_KEY (Bun loads .env automatically).

import { toSeasonGames, type CfbdGame } from "../src/lib/data.ts";

const API = "https://api.collegefootballdata.com";

const key = process.env.CFBD_API_KEY;
if (!key) {
  console.error("CFBD_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

function currentSeason(now = new Date()): number {
  return now.getUTCMonth() < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function parseYears(arg: string | undefined): number[] {
  if (!arg) return [currentSeason()];
  const m = /^(\d{4})(?:-(\d{4}))?$/.exec(arg);
  if (!m) throw new Error(`Expected a year like 2025 or a range like 2014-2025, got "${arg}".`);
  const first = Number(m[1]), last = Number(m[2] ?? m[1]);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

for (const year of parseYears(process.argv[2])) {
  const url = `${API}/games?year=${year}&classification=fbs&seasonType=both`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`CFBD request for ${year} failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const games = toSeasonGames((await res.json()) as CfbdGame[]);
  const out = `data/seasons/${year}.json`;
  await Bun.write(out, `[\n${games.map((g) => JSON.stringify(g)).join(",\n")}\n]\n`);
  console.log(`Saved ${games.length} completed games to ${out}`);
}
