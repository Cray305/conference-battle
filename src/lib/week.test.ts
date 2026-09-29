import { describe, expect, test } from "bun:test";
import { confIndex } from "./conferences.ts";
import { buildDataset, type CalendarWeek, type SeasonGame } from "./data.ts";
import {
  featuredWeek, interest, isFeatured, isUpset, lastPlayedWeek, movement, netByConference,
  playedInWeek, pollFor, seasonStandings, inWeek,
} from "./week.ts";

const SEC = confIndex("SEC"), ACC = confIndex("ACC"), MW = confIndex("MW"), SBC = confIndex("SBC"), FCS = confIndex("FCS");

const sg = (over: Partial<SeasonGame>): SeasonGame => ({
  id: 1, date: "2026-09-05", week: 1, phase: 0, home: "Alabama", homeConf: "SEC", homePts: 30, away: "Clemson", awayConf: "ACC", awayPts: 20, ...over,
});

const ds = buildDataset(new Map([[2026, [
  sg({ id: 1 }),
  sg({ id: 2, home: "Georgia", away: "Samford", awayConf: "FCS", homePts: 50, awayPts: 7 }),
  sg({ id: 3, date: "2026-09-12", week: 2, home: "Florida State", homeConf: "ACC", homePts: 28, away: "Boise State", awayConf: "MW", awayPts: 31 }),
  sg({ id: 4, date: "2026-09-12", week: 2, home: "Auburn", homeConf: "SEC", homePts: 21, away: "Alabama", awayConf: "SEC", awayPts: 24 }),
  sg({ id: 5, date: "2026-09-19", week: 3, home: "Clemson", homeConf: "ACC", homePts: 35, away: "Troy", awayConf: "SBC", awayPts: 10 }),
]]]));

const cal = (week: number, start: string, end: string): CalendarWeek => ({ week, phase: 0, start, end });
const calendar = [
  cal(1, "2026-08-31T07:00:00.000Z", "2026-09-07T06:59:00.000Z"),
  cal(2, "2026-09-07T07:00:00.000Z", "2026-09-14T06:59:00.000Z"),
  cal(3, "2026-09-14T07:00:00.000Z", "2026-09-21T06:59:00.000Z"),
  cal(4, "2026-09-21T07:00:00.000Z", "2026-09-28T06:59:00.000Z"),
];

describe("weeks", () => {
  test("features the week in progress, the first week before the season, and the last one after", () => {
    expect(featuredWeek(calendar, new Date("2026-09-10T12:00:00Z"))?.week).toBe(2);
    expect(featuredWeek(calendar, new Date("2026-08-01T12:00:00Z"))?.week).toBe(1);
    expect(featuredWeek(calendar, new Date("2026-12-01T12:00:00Z"))?.week).toBe(4);
  });

  test("finds a week's cross-conference games and skips conference games", () => {
    expect(playedInWeek(ds, 2026, { phase: 0, week: 2 }).map((k) => ds.games[k]![2])).toEqual([ds.teams.indexOf("Florida State")]);
    expect(lastPlayedWeek(ds, 2026, calendar, { phase: 0, week: 4 })?.week).toBe(3);
  });

  test("uses the poll released before each week", () => {
    const polls = [{ week: 1, phase: 0 as const, ranks: { Alabama: 1 } }, { week: 3, phase: 0 as const, ranks: { Alabama: 2 } }];
    expect(pollFor(polls, { phase: 0, week: 2 })).toEqual({ Alabama: 1 });
    expect(pollFor(polls, { phase: 0, week: 3 })).toEqual({ Alabama: 2 });
    expect(pollFor(polls, { phase: 1, week: 1 })).toEqual({ Alabama: 2 });
  });
});

describe("games to watch", () => {
  test("ranks two ranked teams above one, and Power 4 matchups above the rest", () => {
    expect(interest(3, 10, SEC, ACC)).toBeGreaterThan(interest(1, undefined, SEC, ACC));
    expect(interest(undefined, 25, MW, SBC)).toBeGreaterThan(interest(undefined, undefined, SEC, ACC));
    expect(isFeatured(interest(undefined, undefined, SEC, ACC))).toBe(true);
    expect(isFeatured(interest(undefined, undefined, SEC, MW))).toBe(false);
  });

  test("calls upsets by rank first, then by tier", () => {
    expect(isUpset(undefined, 12, MW, ACC)).toBe(true);
    expect(isUpset(20, 5, SEC, SEC)).toBe(true);
    expect(isUpset(5, 20, SEC, ACC)).toBe(false);
    expect(isUpset(undefined, undefined, MW, ACC)).toBe(true);
    expect(isUpset(undefined, undefined, SEC, FCS)).toBe(false);
  });
});

describe("standings", () => {
  test("orders conferences by record against FBS and tracks FCS games apart", () => {
    const rows = seasonStandings(ds, 2026);
    expect(rows.map((r) => r.conf)).toEqual([SEC, MW, ACC, SBC]);
    expect(rows[0]).toMatchObject({ fbs: { w: 1, l: 0 }, fcs: { w: 1, l: 0 } });
    expect(rows[2]!.fbs).toEqual({ w: 1, l: 2 });
  });

  test("reports movement since last week", () => {
    const before = seasonStandings(ds, 2026, inWeek({ phase: 0, week: 3 }));
    const moves = movement(before, seasonStandings(ds, 2026));
    expect(before.map((r) => r.conf)).toEqual([SEC, MW, ACC]);
    expect(moves.get(SBC)).toBe(0);
    expect(moves.get(ACC)).toBe(0);
  });

  test("totals a week by conference", () => {
    const net = netByConference(ds, playedInWeek(ds, 2026, { phase: 0, week: 1 }));
    expect(net.get(SEC)).toEqual({ w: 2, l: 0 });
    expect(net.get(ACC)).toEqual({ w: 0, l: 1 });
  });
});
