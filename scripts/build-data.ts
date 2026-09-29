// Combines data/seasons/*.json into src/generated/games.json, the compact file
// the page loads. Runs before every dev server start and build.

import { Glob } from "bun";
import { buildDataset, type Schedule, type SeasonGame } from "../src/lib/data.ts";

const seasons = new Map<number, SeasonGame[]>();
for await (const path of new Glob("data/seasons/*.json").scan(".")) {
  const year = Number(/(\d{4})\.json$/.exec(path)?.[1]);
  seasons.set(year, await Bun.file(path).json());
}

const scheduleFile = Bun.file("data/schedule.json");
const schedule: Schedule | undefined = (await scheduleFile.exists()) ? await scheduleFile.json() : undefined;

const teamsFile = Bun.file("data/teams.json");
const logoIds: Record<string, number> = (await teamsFile.exists()) ? await teamsFile.json() : {};

const ds = buildDataset(seasons, schedule, logoIds);
const out = "src/generated/games.json";
await Bun.write(out, JSON.stringify(ds));
console.log(`Wrote ${ds.games.length} games from ${ds.first}–${ds.last} (last game ${ds.lastGame}) to ${out}`);
