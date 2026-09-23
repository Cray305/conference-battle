// Downloads one season of FBS games from the CollegeFootballData API and
// saves the raw response to data/raw/. Aggregation comes later.
//
// Usage: bun scripts/fetch-games.ts [year]
// Requires CFBD_API_KEY in .env (Bun loads it automatically).

const API = "https://api.collegefootballdata.com";

const key = process.env.CFBD_API_KEY;
if (!key) {
  console.error("CFBD_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const year = Number(process.argv[2] ?? new Date().getFullYear());
const url = `${API}/games?year=${year}&classification=fbs&seasonType=both`;

const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`CFBD request failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const games: unknown[] = await res.json();
const out = `data/raw/games-${year}.json`;
await Bun.write(out, JSON.stringify(games, null, 2));
console.log(`Saved ${games.length} games to ${out}`);
