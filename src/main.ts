import Alpine from "alpinejs";
import gamesUrl from "./generated/games.json" with { type: "file" };
import { CONFS, FCS, PRESETS, PRESET_LABELS, type ConfId } from "./lib/conferences.ts";
import { tally, tallyTeam, type Dataset, type Filters, type GameRow, type Rec, type WL } from "./lib/data.ts";
import { bin, fmtPct, fmtWL, THIN, winPct } from "./lib/format.ts";
import { currentSeason } from "./lib/season.ts";
import {
  featuredWeek, inWeek, interest, isFeatured, isUpset, lastPlayedWeek, movement, netByConference,
  nextScheduledWeek, playedInWeek, pollFor, scheduledInWeek, seasonStandings, weekKey,
} from "./lib/week.ts";
import type { CalendarWeek, ScheduledGame } from "./lib/data.ts";

type PresetKey = keyof typeof PRESETS;
type Pair = [number, number];

// The dataset and records live outside Alpine's reactive state so thousands of
// game rows aren't wrapped in proxies. `rev` changes whenever they do.
let ds: Dataset;
let rec: Rec[][] = [];
let teamRec: Rec[] = [];
let teamName = "";

/** Row index for the pinned team row; conference rows use their CONFS index. */
const TEAM = -1;

const phone = matchMedia("(max-width: 640px)");
const name = (i: number) => (i === TEAM ? teamName : i === FCS ? "FCS" : CONFS[i]!.name);
const abbr = (i: number) => (i === TEAM ? teamName : CONFS[i]!.id);
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hasGames = (r: WL) => r.w + r.l > 0;
const confOf = (id: string) => CONFS.findIndex((c) => c.id === id);

// Week dates follow the CFBD calendar, which splits weeks at midnight Pacific.
const PT = "America/Los_Angeles";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: PT });
const weekTitle = (w: CalendarWeek) => (w.phase ? "Bowl season" : `Week ${w.week}`);
const weekDates = (w: CalendarWeek) => `${day(w.start)} – ${day(w.end)}`;
/** How many games a weekly list shows before "Show all". */
const SLATE = 10;

// Keep logic in typed components registered here; the HTML should only
// reference their properties and methods, since Alpine attribute
// expressions aren't type-checked.
Alpine.data("app", () => ({
  CONFS,
  FCS,
  TEAM,
  presets: Object.keys(PRESETS) as PresetKey[],
  presetLabel: (k: PresetKey) => PRESET_LABELS[k],
  name,
  abbr,
  fmtPct,
  fmtWL,

  status: "loading" as "loading" | "ready" | "error",
  rev: 0,
  first: 0,
  last: 0,
  lastGame: "",
  from: 0,
  to: 0,
  phase: "all" as Filters["phase"],
  membership: "then" as Filters["membership"],
  visible: [...PRESETS.all] as ConfId[],
  order: CONFS.map((_, i) => i),
  selected: [0, 1] as Pair,
  focus: null as number | null,
  hover: null as Pair | null,
  tipX: 0,
  tipY: 0,
  controlsOpen: false,
  tab: "all" as "all" | "week",
  standYear: 0,
  allNext: false,
  allLast: false,
  isPhone: phone.matches,
  team: null as number | null,
  teamQuery: "",
  teamList: [] as { i: number; name: string }[],

  async init() {
    phone.addEventListener("change", () => (this.isPhone = phone.matches));
    try {
      const res = await fetch(gamesUrl);
      if (!res.ok) throw new Error(`${res.status}`);
      ds = await res.json();
    } catch {
      this.status = "error";
      return;
    }
    // Open on the season in progress, kept within the years we have data for.
    this.first = ds.first;
    this.last = ds.last;
    this.from = this.to = Math.min(Math.max(currentSeason(), ds.first), ds.last);
    this.lastGame = ds.lastGame;
    this.standYear = ds.schedule?.season ?? ds.last;
    // FBS programs only: FCS teams' games against each other aren't in the data.
    const fbs = new Set<number>();
    for (const g of ds.games) { if (g[4] !== FCS) fbs.add(g[2]); if (g[5] !== FCS) fbs.add(g[3]); }
    this.teamList = [...fbs].map((i) => ({ i, name: ds.teams[i]! })).sort((a, b) => a.name.localeCompare(b.name));
    this.recalc();
    this.readHash();
    this.status = "ready";
    for (const key of ["from", "to", "phase", "membership"] as const) this.$watch(key, () => this.recalc());
    this.$watch("visible", () => this.keepSelectionVisible());
    this.$watch("selected", () => this.writeHash());
    this.$watch("team", () => this.writeHash());
    this.$watch("tab", () => { this.writeHash(); this.allNext = this.allLast = false; });
    window.addEventListener("hashchange", () => this.readHash());
  },

  // Data -----------------------------------------------------------------

  filters(): Filters {
    const [from, to] = this.from <= this.to ? [this.from, this.to] : [this.to, this.from];
    return { from, to, phase: this.phase, membership: this.membership };
  },

  recalc() {
    rec = tally(ds, this.filters());
    teamRec = this.team === null ? [] : tallyTeam(ds, this.filters(), this.team);
    teamName = this.team === null ? "" : ds.teams[this.team]!;
    // Strongest conferences first, by record against the rest of FBS; FCS last.
    const vsFbs = (i: number) => rec[i]!.reduce((t, r, j) => (j === FCS ? t : { w: t.w + r.w, l: t.l + r.l }), { w: 0, l: 0 });
    this.order = CONFS.map((_, i) => i).filter((i) => i !== FCS).sort((a, b) => winPct(vsFbs(b)) - winPct(vsFbs(a))).concat(FCS);
    this.rev++;
    this.keepSelectionVisible();
  },

  r(i: number, j: number): Rec {
    void this.rev;
    return i === TEAM ? teamRec[j]! : rec[i]![j]!;
  },

  get seasons(): number[] {
    return Array.from({ length: this.last - this.first + 1 }, (_, k) => this.first + k);
  },

  get shown(): number[] {
    return this.order.filter((i) => this.visible.includes(CONFS[i]!.id));
  },

  /** Matrix rows: the pinned team, if any, then the visible conferences. */
  get rows(): number[] {
    return this.team === null ? this.shown : [TEAM, ...this.shown];
  },

  // Team row ---------------------------------------------------------------

  findTeam(q: string) {
    const s = q.trim().toLowerCase();
    return s ? this.teamList.find((t) => t.name.toLowerCase() === s) : undefined;
  },
  matchTeam() {
    const t = this.findTeam(this.teamQuery);
    if (t && t.i !== this.team) this.setTeam(t.i);
    else if (!this.teamQuery.trim() && this.team !== null) this.clearTeam();
  },
  settleTeam() {
    this.matchTeam();
    this.teamQuery = this.team === null ? "" : ds.teams[this.team]!;
  },
  setTeam(i: number, opp?: number) {
    this.team = i;
    this.teamQuery = ds.teams[i]!;
    this.recalc();
    // Open on the conference the team has played most, which is usually its own.
    const V = this.shown;
    const most = [...V].sort((a, b) => this.r(TEAM, b).w + this.r(TEAM, b).l - (this.r(TEAM, a).w + this.r(TEAM, a).l))[0];
    this.selected = [TEAM, opp !== undefined && V.includes(opp) ? opp : most ?? V[0]!];
  },
  clearTeam() {
    this.team = null;
    this.teamQuery = "";
    this.recalc();
  },

  // Conference picker ----------------------------------------------------

  isOn(id: ConfId) {
    return this.visible.includes(id);
  },
  isLocked(id: ConfId) {
    return this.isOn(id) && this.visible.length <= 2;
  },
  chipTitle(c: (typeof CONFS)[number]) {
    return this.isLocked(c.id) ? "Keep at least two conferences" : `${this.isOn(c.id) ? "Hide" : "Show"} ${c.name}`;
  },
  toggleConf(id: ConfId) {
    if (this.isLocked(id)) return;
    this.visible = this.isOn(id) ? this.visible.filter((v) => v !== id) : [...this.visible, id];
  },
  get activePreset(): PresetKey | undefined {
    return this.presets.find((k) => PRESETS[k].length === this.visible.length && PRESETS[k].every((id) => this.visible.includes(id)));
  },
  applyPreset(k: PresetKey) {
    this.visible = [...PRESETS[k]];
  },
  get summary(): string {
    const phase = { all: "All games", reg: "Regular season", post: "Bowls & CFP" }[this.phase];
    const confs = this.activePreset ? PRESET_LABELS[this.activePreset] : `${this.visible.length} conferences`;
    const f = this.filters();
    return `${f.from === f.to ? f.from : `${f.from}–${f.to}`} · ${phase} · ${confs}${this.team === null ? "" : ` · ${ds.teams[this.team]}`}`;
  },

  // Selection ------------------------------------------------------------

  keepSelectionVisible() {
    const V = this.shown;
    const [a, b] = this.selected;
    if ((V.includes(a) || (a === TEAM && this.team !== null)) && V.includes(b)) return;
    if (a === TEAM && this.team !== null && V.length) {
      this.selected = [TEAM, V.find((j) => hasGames(this.r(TEAM, j))) ?? V[0]!];
      return;
    }
    const pair = V.flatMap((i) => V.filter((j) => j !== i && hasGames(this.r(i, j))).map((j): Pair => [i, j]))[0];
    this.selected = pair ?? [V[0]!, V[1]!];
    if (this.focus !== null && !this.rows.includes(this.focus)) this.focus = null;
  },
  select(i: number, j: number) {
    if (i === j || !hasGames(this.r(i, j))) return;
    this.selected = [i, j];
  },
  isSelected(i: number, j: number) {
    return this.selected[0] === i && this.selected[1] === j;
  },
  pickA(v: string) {
    const a = Number(v);
    this.selected = [a, this.selected[1] === a ? this.shown.find((k) => k !== a)! : this.selected[1]];
  },
  pickB(v: string) {
    this.selected = [this.selected[0], Number(v)];
  },
  opponentsOf(i: number) {
    return this.shown.filter((k) => k !== i);
  },

  // The hash is "sec-b1g" for a conference matchup, "texas.sec" for a team
  // against a conference, or "sec-b1g.texas" with a team pinned elsewhere.
  writeHash() {
    if (this.tab === "week") return history.replaceState(null, "", "#week");
    const [a, b] = this.selected;
    const team = this.team === null ? "" : slug(ds.teams[this.team]!);
    const hash = a === TEAM ? `${team}.${CONFS[b]!.id}` : `${CONFS[a]!.id}-${CONFS[b]!.id}${team && `.${team}`}`;
    history.replaceState(null, "", `#${hash.toLowerCase()}`);
  },
  readHash() {
    if (location.hash === "#week" && ds.schedule) { this.tab = "week"; return; }
    if (location.hash.length > 1) this.tab = "all";
    const conf = (id = "") => CONFS.findIndex((c) => c.id === id.toUpperCase());
    const show = (i: number) => { if (!this.isOn(CONFS[i]!.id)) this.visible = [...this.visible, CONFS[i]!.id]; };
    let pair: Pair | undefined, team: number | undefined, opp: number | undefined;
    for (const part of location.hash.slice(1).split(".")) {
      const [a, b] = part.split("-").map(conf);
      if (a !== undefined && b !== undefined && a >= 0 && b >= 0 && a !== b && part.split("-").length === 2) pair = [a, b];
      else if (conf(part) >= 0) opp = conf(part);
      else team = this.teamList.find((t) => slug(t.name) === part)?.i ?? team;
    }
    if (pair) { pair.forEach(show); }
    if (opp !== undefined) show(opp);
    if (team !== undefined) this.setTeam(team, opp);
    if (pair && (team === undefined || opp === undefined)) this.selected = pair;
  },

  // Matrix ---------------------------------------------------------------

  edge(i: number, j: number) {
    return { "fcs-col": j === FCS, "fcs-row": i === FCS };
  },
  cellClass(i: number, j: number) {
    const x = this.r(i, j), n = x.w + x.l;
    return {
      ...this.edge(i, j),
      self: i === j || !n,
      diag: i === j,
      [n ? bin(winPct(x)) : "empty"]: i !== j,
      thin: i !== j && n > 0 && n < THIN,
      sel: this.isSelected(i, j),
    };
  },
  headClass(j: number) {
    return { ...this.edge(-1, j), "hl-axis": this.hover?.[1] === j };
  },
  rowHeadClass(i: number) {
    return { ...this.edge(i, -1), "hl-axis": this.hover?.[0] === i };
  },
  cellText(i: number, j: number) {
    if (i === j) return "";
    const x = this.r(i, j);
    return hasGames(x) ? fmtWL(x) : "·";
  },
  cellPct(i: number, j: number) {
    return i === j ? "" : hasGames(this.r(i, j)) ? fmtPct(this.r(i, j)) : "";
  },
  cellTab(i: number, j: number) {
    return i !== j && hasGames(this.r(i, j)) ? 0 : -1;
  },
  cellLabel(i: number, j: number) {
    if (i === j) return `${name(i)} against itself`;
    if (i === TEAM && !hasGames(this.r(i, j))) return `${name(i)} hasn't played ${name(j)}`;
    const x = this.r(i, j);
    return hasGames(x) ? `${name(i)} vs ${name(j)}: ${x.w} wins, ${x.l} losses` : `${name(i)} and ${name(j)} haven't played`;
  },
  rowLabel(i: number) {
    return i === TEAM ? teamName : i === FCS ? "All FCS teams" : CONFS[i]!.name;
  },
  rowTotal(i: number) {
    const t = this.shown.reduce((acc, j) => ({ w: acc.w + this.r(i, j).w, l: acc.l + this.r(i, j).l }), { w: 0, l: 0 });
    return fmtWL(t);
  },
  enterCell(e: PointerEvent, i: number, j: number) {
    if (e.pointerType === "touch" || i === j || !hasGames(this.r(i, j))) return this.leaveCell();
    this.hover = [i, j];
    this.moveTip(e);
  },
  leaveCell() {
    this.hover = null;
  },
  moveTip(e: PointerEvent) {
    const tip = this.$refs.tip, pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (tip && x + tip.offsetWidth > innerWidth - 8) x = e.clientX - tip.offsetWidth - pad;
    if (tip && y + tip.offsetHeight > innerHeight - 8) y = e.clientY - tip.offsetHeight - pad;
    this.tipX = x;
    this.tipY = y;
  },
  get tip() {
    if (!this.hover) return null;
    const [i, j] = this.hover, x = this.r(i, j);
    return { a: name(i), b: name(j), line: `${fmtWL(x)} (${fmtPct(x)}) · ${x.w + x.l} games`, post: `Bowls/CFP ${fmtWL(x.post)}` };
  },

  // Phone: one conference against everyone ------------------------------

  openFocus(i: number) {
    if (!this.isPhone) return;
    this.focus = i;
    if (this.selected[0] !== i) {
      const j = this.shown.find((k) => k !== i && hasGames(this.r(i, k)));
      if (j !== undefined) this.selected = [i, j];
    }
  },
  setFocus(v: string) {
    this.openFocus(Number(v));
  },
  get focusRows() {
    if (this.focus === null) return [];
    const i = this.focus;
    return this.opponentsOf(i)
      .map((j) => ({ j, x: this.r(i, j) }))
      .sort((a, b) => (hasGames(b.x) ? winPct(b.x) : -1) - (hasGames(a.x) ? winPct(a.x) : -1))
      .map(({ j, x }) => ({
        j,
        name: j === FCS ? "FCS teams" : CONFS[j]!.name,
        played: hasGames(x),
        wl: hasGames(x) ? fmtWL(x) : "—",
        pct: hasGames(x) ? fmtPct(x) : "",
        sw: hasGames(x) ? `${bin(winPct(x))}${x.w + x.l < THIN ? " thin" : ""}` : "",
        width: `${(winPct(x) * 100).toFixed(1)}%`,
        current: this.isSelected(i, j),
        label: `${name(i)} vs ${name(j)}: ${x.w} wins, ${x.l} losses`,
      }));
  },
  get focusSummary() {
    const rows = this.focusRows, played = rows.filter((r) => r.played);
    if (this.focus === null) return { total: "", pct: "", count: 0, best: "", worst: "" };
    const t = rows.reduce((acc, r) => ({ w: acc.w + this.r(this.focus!, r.j).w, l: acc.l + this.r(this.focus!, r.j).l }), { w: 0, l: 0 });
    return {
      total: fmtWL(t),
      pct: fmtPct(t),
      count: rows.length,
      best: played[0] ? CONFS[played[0].j]!.id : "",
      worst: played.at(-1) ? CONFS[played.at(-1)!.j]!.id : "",
    };
  },
  get readout() {
    const [i, j] = this.selected, x = this.r(i, j);
    return {
      sw: hasGames(x) ? `${bin(winPct(x))}${x.w + x.l < THIN ? " thin" : ""}` : "",
      text: `${abbr(i)} vs ${abbr(j)} · ${hasGames(x) ? `${fmtWL(x)} · ${fmtPct(x)}` : "No games"}`,
    };
  },

  // Detail panel ---------------------------------------------------------

  get detail() {
    const [i, j] = this.selected, x = this.r(i, j), n = x.w + x.l;
    const lead = x.w - x.l;
    const verdict = !n ? (i === TEAM ? `${name(i)} didn't play ${name(j)} in the selected seasons.` : "These conferences haven't met in the selected seasons.")
      : i === TEAM ? `${name(i)} is ${fmtWL(x)} against ${name(j)} across ${n} game${n === 1 ? "" : "s"}.`
      : lead === 0 ? `The series is even over ${n} games.`
      : `${lead > 0 ? name(i) : name(j)} leads the series by ${Math.abs(lead)} game${Math.abs(lead) === 1 ? "" : "s"} across ${n} meetings.`;
    const rowWon = (k: number) => {
      const g = ds.games[k]!;
      const homeIsRow = i === TEAM ? g[2] === this.team : (this.membership === "now" ? ds.current[g[2]] : g[4]) === i;
      return homeIsRow === (g[6] > g[7]);
    };
    const last5 = x.games.slice(0, 5), w5 = last5.filter(rowWon).length;
    const f = this.filters();
    return {
      a: name(i), b: name(j), aId: abbr(i), bId: abbr(j),
      range: f.from === f.to ? `${f.from}` : `${f.from}–${f.to}`,
      wl: fmtWL(x), pct: fmtPct(x),
      tug: `${n ? winPct(x) * 100 : 50}%`,
      verdict,
      reg: fmtWL(x.reg), post: fmtWL(x.post),
      last5: last5.length ? `${w5}–${last5.length - w5}` : "—",
      recent: x.games.slice(0, 6).map((k) => this.meeting(ds.games[k]!, k)),
    };
  },
  meeting(g: GameRow, k: number) {
    const [season, phase, home, away, , , hp, ap] = g;
    const homeWon = hp > ap;
    return {
      k,
      year: season,
      winner: `${ds.teams[homeWon ? home : away]} ${Math.max(hp, ap)}`,
      loser: `${ds.teams[homeWon ? away : home]} ${Math.min(hp, ap)}`,
      tag: phase === 2 ? "CFP" : phase === 1 ? "Bowl" : "",
    };
  },

  // Standings ------------------------------------------------------------

  get standings() {
    const V = this.shown;
    const opp = V.filter((j) => j !== FCS);
    const fcsOn = V.includes(FCS) && this.phase !== "post";
    const rows = opp.map((i) => {
      const t = { w: 0, l: 0 }, post = { w: 0, l: 0 };
      for (const j of opp) {
        const x = this.r(i, j);
        t.w += x.w; t.l += x.l; post.w += x.post.w; post.l += x.post.l;
      }
      const fc = fcsOn ? this.r(i, FCS) : { w: 0, l: 0 };
      const all = { w: t.w + fc.w, l: t.l + fc.l };
      return { i, name: CONFS[i]!.name, tier: CONFS[i]!.tier === "Ind" ? "IND" : CONFS[i]!.tier, wl: fmtWL(all), pct: fmtPct(all), p: winPct(all), bar: `${(winPct(all) * 100).toFixed(1)}%`, post: fmtWL(post), fcs: fmtWL(fc) };
    }).sort((a, b) => b.p - a.p);
    const oppText = opp.length === PRESETS.fbs.length ? "every other FBS conference"
      : `the other selected conferences (${opp.map((j) => CONFS[j]!.name).join(", ")})`;
    return { rows, fcsOn, note: `Each conference's combined record against ${oppText}${fcsOn ? ", plus FCS teams" : ""}.` };
  },

  // This week -------------------------------------------------------------

  get weekly() {
    // Reading status makes this rerun once the data arrives; the tab bar renders before that.
    if (this.status !== "ready") return null;
    const sch = ds.schedule;
    if (!sch?.calendar.length) return null;
    const now = new Date();
    const featured = featuredWeek(sch.calendar, now)!;
    const next = nextScheduledWeek(sch.upcoming, sch.calendar, featured);
    const last = lastPlayedWeek(ds, sch.season, sch.calendar, featured);

    const upcoming = next ? scheduledInWeek(sch.upcoming, next).map((g) => this.slateGame(g, pollFor(sch.polls, next), now)) : [];
    upcoming.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));

    const played = last ? playedInWeek(ds, sch.season, last) : [];
    const ranks = last ? pollFor(sch.polls, last) : {};
    const results = played.map((k) => this.resultGame(k, ranks));
    results.sort((a, b) => Number(b.upset) - Number(a.upset) || b.score - a.score);
    const net = [...netByConference(ds, played)]
      .filter(([c]) => c !== FCS)
      .sort(([, a], [, b]) => b.w - b.l - (a.w - a.l) || b.w - a.w)
      .map(([c, r]) => ({ id: CONFS[c]!.id, wl: fmtWL(r) }));

    return {
      season: sch.season,
      next: next && {
        title: next === featured ? `${weekTitle(next)}: up next` : `Up next: ${weekTitle(next)}`,
        label: weekTitle(next),
        dates: weekDates(next),
        games: this.allNext ? upcoming : upcoming.slice(0, SLATE),
        more: upcoming.length > SLATE && !this.allNext ? upcoming.length : 0,
        featured: upcoming.filter((g) => g.featured).length,
      },
      last: last && {
        title: `${weekTitle(last)} results`,
        dates: weekDates(last),
        games: this.allLast ? results : results.slice(0, SLATE),
        more: results.length > SLATE && !this.allLast ? results.length : 0,
        net,
        key: weekKey(last),
      },
    };
  },
  slateGame(g: ScheduledGame, ranks: Record<string, number>, now: Date) {
    const hc = confOf(g.homeConf), ac = confOf(g.awayConf);
    const hr = ranks[g.home], ar = ranks[g.away];
    const score = interest(hr, ar, hc, ac);
    const kick = new Date(g.start);
    const when = kick.getTime() < now.getTime() - 5 * 3600e3 ? "Awaiting score"
      : g.tbd ? `${kick.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })} · TBD`
      : kick.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(":00", "");
    return {
      id: g.id, start: g.start, when, score, featured: isFeatured(score),
      away: g.away, awayRank: ar ?? "", home: g.home, homeRank: hr ?? "",
      at: g.neutral ? "vs" : "at",
      confs: `${CONFS[ac]!.id} ${g.neutral ? "vs" : "at"} ${CONFS[hc]!.id}`,
      tag: g.name ?? (hr && ar ? "Top 25" : ""),
    };
  },
  resultGame(k: number, ranks: Record<string, number>) {
    const [, phase, home, away, hc, ac, hp, ap] = ds.games[k]!;
    const homeWon = hp > ap;
    const [w, l, wc, lc] = homeWon ? [home, away, hc, ac] : [away, home, ac, hc];
    const wName = ds.teams[w]!, lName = ds.teams[l]!;
    const wr = ranks[wName], lr = ranks[lName];
    const upset = isUpset(wr, lr, wc, lc);
    return {
      k, upset, score: interest(wr, lr, wc, lc),
      winner: wName, winnerRank: wr ?? "", winnerPts: Math.max(hp, ap),
      loser: lName, loserRank: lr ?? "", loserPts: Math.min(hp, ap),
      confs: `${CONFS[wc]!.id} over ${CONFS[lc]!.id}`,
      tag: upset ? "Upset" : phase === 2 ? "CFP" : phase === 1 ? "Bowl" : "",
    };
  },
  get yearStandings() {
    const year = this.standYear;
    const rows = seasonStandings(ds, year);
    const sch = ds.schedule;
    const last = sch && year === sch.season ? lastPlayedWeek(ds, year, sch.calendar, featuredWeek(sch.calendar, new Date())!) : undefined;
    const moves = last ? movement(seasonStandings(ds, year, inWeek(last)), rows) : null;
    return {
      moves: !!moves,
      movesSince: last ? weekTitle(last) : "",
      rows: rows.map((r, k) => {
        const m = moves?.get(r.conf) ?? 0;
        return {
          rank: k + 1, conf: r.conf, name: CONFS[r.conf]!.name,
          tier: CONFS[r.conf]!.tier === "Ind" ? "IND" : CONFS[r.conf]!.tier,
          wl: fmtWL(r.fbs), pct: fmtPct(r.fbs), bar: `${(winPct(r.fbs) * 100).toFixed(1)}%`,
          post: fmtWL(r.post), fcs: fmtWL(r.fcs),
          move: m > 0 ? `▲${m}` : m < 0 ? `▼${-m}` : "–",
          moveLabel: m > 0 ? `Up ${m}` : m < 0 ? `Down ${-m}` : "No change",
        };
      }),
    };
  },
  standingsYears(): number[] {
    return [...this.seasons].reverse();
  },

  get updated(): string {
    if (!this.lastGame) return "";
    const d = new Date(`${this.lastGame}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  },
}));

// The theme toggle flips whichever theme is showing, whether it came from a
// saved choice or the system setting, and remembers the choice.
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const themeButton = document.getElementById("theme")!;
const isDark = () => (document.documentElement.dataset.theme ?? (darkQuery.matches ? "dark" : "light")) === "dark";
const labelTheme = () => {
  const label = isDark() ? "Switch to light mode" : "Switch to dark mode";
  themeButton.setAttribute("aria-label", label);
  themeButton.title = label;
};
themeButton.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
  labelTheme();
});
darkQuery.addEventListener("change", labelTheme);
labelTheme();

Alpine.start();
