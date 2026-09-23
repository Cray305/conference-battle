import { describe, expect, test } from "bun:test";
import { confIndex } from "./conferences.ts";
import { buildDataset, tally, toSeasonGames, type CfbdGame, type Filters, type SeasonGame } from "./data.ts";
import { bin, fmtPct } from "./format.ts";

const cfbd = (over: Partial<CfbdGame>): CfbdGame => ({
  id: 1, season: 2023, seasonType: "regular", startDate: "2023-09-02T19:00:00.000Z", completed: true,
  homeTeam: "Alabama", homeConference: "SEC", homeClassification: "fbs", homePoints: 30,
  awayTeam: "Texas", awayConference: "Big 12", awayClassification: "fbs", awayPoints: 34,
  ...over,
});

describe("toSeasonGames", () => {
  test("maps CFBD conference names and keeps the score", () => {
    const [g] = toSeasonGames([cfbd({})]);
    expect(g).toEqual({ id: 1, date: "2023-09-02", phase: 0, home: "Alabama", homeConf: "SEC", homePts: 30, away: "Texas", awayConf: "B12", awayPts: 34 });
  });

  test("groups FCS teams and drops Division II and III opponents", () => {
    const games = toSeasonGames([
      cfbd({ id: 1, awayTeam: "Montana", awayConference: "Big Sky", awayClassification: "fcs" }),
      cfbd({ id: 2, awayTeam: "Some College", awayConference: null, awayClassification: "ii" }),
    ]);
    expect(games.map((g) => [g.id, g.awayConf])).toEqual([[1, "FCS"]]);
  });

  test("skips games that haven't been played", () => {
    expect(toSeasonGames([cfbd({ completed: false, homePoints: null, awayPoints: null })])).toEqual([]);
  });

  test("tells bowls from playoff games", () => {
    const games = toSeasonGames([
      cfbd({ id: 1, seasonType: "postseason", notes: "Citrus Bowl" }),
      cfbd({ id: 2, seasonType: "postseason", notes: "CFP Semifinal at the Rose Bowl" }),
      cfbd({ id: 3, seasonType: "postseason", notes: "College Football Playoff National Championship" }),
    ]);
    expect(games.map((g) => g.phase)).toEqual([1, 2, 2]);
  });

  test("fails loudly on a conference it doesn't know", () => {
    expect(() => toSeasonGames([cfbd({ awayConference: "Southwest Conference" })])).toThrow(/Unknown FBS conference/);
  });
});

const sg = (over: Partial<SeasonGame>): SeasonGame => ({
  id: 1, date: "2023-09-02", phase: 0, home: "Alabama", homeConf: "SEC", homePts: 30, away: "Texas", awayConf: "B12", awayPts: 34, ...over,
});

// Texas beats Alabama as a Big 12 team in 2023, then joins the SEC in 2024.
const seasons = new Map<number, SeasonGame[]>([
  [2023, [
    sg({ id: 1 }),
    sg({ id: 2, date: "2023-09-09", home: "Texas", homeConf: "B12", homePts: 38, away: "Baylor", awayConf: "B12", awayPts: 6 }),
    sg({ id: 3, date: "2024-01-01", phase: 2, home: "Texas", homeConf: "B12", homePts: 31, away: "Washington", awayConf: "P12", awayPts: 37 }),
  ]],
  [2024, [
    sg({ id: 4, date: "2024-08-31", home: "Texas", homeConf: "SEC", homePts: 52, away: "Colorado State", awayConf: "MW", awayPts: 0 }),
    sg({ id: 5, date: "2024-09-07", home: "Alabama", homeConf: "SEC", homePts: 42, away: "Montana", awayConf: "FCS", awayPts: 7 }),
    sg({ id: 6, date: "2024-09-14", home: "Washington", homeConf: "B1G", homePts: 24, away: "Baylor", awayConf: "B12", awayPts: 20 }),
  ]],
]);

const all: Filters = { from: 2023, to: 2024, phase: "all", membership: "then" };
const SEC = confIndex("SEC"), B12 = confIndex("B12"), P12 = confIndex("P12"), MW = confIndex("MW"), FCS = confIndex("FCS"), B1G = confIndex("B1G");

describe("buildDataset", () => {
  const ds = buildDataset(seasons);

  test("records each team's latest conference", () => {
    expect(ds.current[ds.teams.indexOf("Texas")]).toBe(SEC);
    expect(ds.current[ds.teams.indexOf("Washington")]).toBe(B1G);
  });

  test("drops games that are conference games under both views, newest first", () => {
    // Texas–Baylor 2023 was a Big 12 game, but Texas is SEC now, so it stays.
    expect(ds.games).toHaveLength(6);
    expect(ds.games[0]![0]).toBe(2024);
    expect(ds.lastGame).toBe("2024-09-14");
    expect([ds.first, ds.last]).toEqual([2023, 2024]);
  });

  test("refuses to build without data", () => {
    expect(() => buildDataset(new Map())).toThrow(/No season data/);
  });
});

describe("tally", () => {
  const ds = buildDataset(seasons);

  test("counts games for the conferences as of each game", () => {
    const rec = tally(ds, all);
    expect(rec[B12]![SEC]).toMatchObject({ w: 1, l: 0 });
    expect(rec[SEC]![B12]).toMatchObject({ w: 0, l: 1 });
    expect(rec[B12]![P12]).toMatchObject({ w: 0, l: 1, post: { w: 0, l: 1 }, reg: { w: 0, l: 0 } });
    expect(rec[SEC]![MW]!.w).toBe(1);
    expect(rec[SEC]![FCS]!.w).toBe(1);
    expect(rec[B12]![B12]!.w + rec[B12]![B12]!.l).toBe(0);
  });

  test("regroups games under current membership", () => {
    const rec = tally(ds, { ...all, membership: "now" });
    // Alabama–Texas is now an SEC game and drops out, while Texas–Baylor becomes SEC vs Big 12.
    expect(rec[SEC]![B12]).toMatchObject({ w: 1, l: 0 });
    expect(rec[SEC]![B1G]).toMatchObject({ w: 0, l: 1 });
  });

  test("filters by season and phase", () => {
    expect(tally(ds, { ...all, from: 2024 })[B12]![SEC]!.w).toBe(0);
    expect(tally(ds, { ...all, phase: "post" })[B12]![P12]!.l).toBe(1);
    expect(tally(ds, { ...all, phase: "reg" })[B12]![P12]!.l).toBe(0);
  });

  test("lists the games behind each record, newest first", () => {
    const rec = tally(ds, all);
    const years = rec[B12]![SEC]!.games.map((k) => ds.games[k]![0]);
    expect(years).toEqual([2023]);
  });
});

describe("format", () => {
  test("fmtPct", () => {
    expect(fmtPct({ w: 5, l: 3 })).toBe(".625");
    expect(fmtPct({ w: 4, l: 0 })).toBe("1.000");
    expect(fmtPct({ w: 0, l: 0 })).toBe("—");
  });

  test("bin edges", () => {
    expect([0.65, 0.55, 0.5, 0.45, 0.35, 0.2].map(bin)).toEqual(["b-w2", "b-w1", "b-0", "b-l1", "b-l2", "b-l2"]);
  });
});
