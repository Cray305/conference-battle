import Alpine from "alpinejs";
import gamesUrl from "./generated/games.json" with { type: "file" };
import { CONFS, FCS, PRESETS, PRESET_LABELS, type ConfId } from "./lib/conferences.ts";
import { tally, type Dataset, type Filters, type GameRow, type Rec, type WL } from "./lib/data.ts";
import { bin, fmtPct, fmtWL, THIN, winPct } from "./lib/format.ts";

type PresetKey = keyof typeof PRESETS;
type Pair = [number, number];

// The dataset and records live outside Alpine's reactive state so thousands of
// game rows aren't wrapped in proxies. `rev` changes whenever they do.
let ds: Dataset;
let rec: Rec[][] = [];

const phone = matchMedia("(max-width: 640px)");
const name = (i: number) => (i === FCS ? "FCS" : CONFS[i]!.name);
const hasGames = (r: WL) => r.w + r.l > 0;

// Keep logic in typed components registered here; the HTML should only
// reference their properties and methods, since Alpine attribute
// expressions aren't type-checked.
Alpine.data("app", () => ({
  CONFS,
  FCS,
  presets: Object.keys(PRESETS) as PresetKey[],
  presetLabel: (k: PresetKey) => PRESET_LABELS[k],
  name,
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
  isPhone: phone.matches,

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
    this.first = this.from = ds.first;
    this.last = this.to = ds.last;
    this.lastGame = ds.lastGame;
    this.recalc();
    this.readHash();
    this.status = "ready";
    for (const key of ["from", "to", "phase", "membership"] as const) this.$watch(key, () => this.recalc());
    this.$watch("visible", () => this.keepSelectionVisible());
    this.$watch("selected", () => this.writeHash());
    window.addEventListener("hashchange", () => this.readHash());
  },

  // Data -----------------------------------------------------------------

  filters(): Filters {
    const [from, to] = this.from <= this.to ? [this.from, this.to] : [this.to, this.from];
    return { from, to, phase: this.phase, membership: this.membership };
  },

  recalc() {
    rec = tally(ds, this.filters());
    // Strongest conferences first, by record against the rest of FBS; FCS last.
    const vsFbs = (i: number) => rec[i]!.reduce((t, r, j) => (j === FCS ? t : { w: t.w + r.w, l: t.l + r.l }), { w: 0, l: 0 });
    this.order = CONFS.map((_, i) => i).filter((i) => i !== FCS).sort((a, b) => winPct(vsFbs(b)) - winPct(vsFbs(a))).concat(FCS);
    this.rev++;
    this.keepSelectionVisible();
  },

  r(i: number, j: number): Rec {
    void this.rev;
    return rec[i]![j]!;
  },

  get seasons(): number[] {
    return Array.from({ length: this.last - this.first + 1 }, (_, k) => this.first + k);
  },

  get shown(): number[] {
    return this.order.filter((i) => this.visible.includes(CONFS[i]!.id));
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
    return `${f.from}–${f.to} · ${phase} · ${confs}`;
  },

  // Selection ------------------------------------------------------------

  keepSelectionVisible() {
    const V = this.shown;
    const [a, b] = this.selected;
    if (V.includes(a) && V.includes(b)) return;
    const pair = V.flatMap((i) => V.filter((j) => j !== i && hasGames(this.r(i, j))).map((j): Pair => [i, j]))[0];
    this.selected = pair ?? [V[0]!, V[1]!];
    if (this.focus !== null && !V.includes(this.focus)) this.focus = null;
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

  writeHash() {
    const [a, b] = this.selected;
    history.replaceState(null, "", `#${CONFS[a]!.id}-${CONFS[b]!.id}`.toLowerCase());
  },
  readHash() {
    const [a, b] = location.hash.slice(1).toUpperCase().split("-").map((id) => CONFS.findIndex((c) => c.id === id));
    if (a === undefined || b === undefined || a < 0 || b < 0 || a === b) return;
    for (const id of [CONFS[a]!.id, CONFS[b]!.id]) if (!this.isOn(id)) this.visible = [...this.visible, id];
    this.selected = [a, b];
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
    const x = this.r(i, j);
    return hasGames(x) ? `${name(i)} vs ${name(j)}: ${x.w} wins, ${x.l} losses` : `${name(i)} and ${name(j)} haven't played`;
  },
  rowLabel(i: number) {
    return i === FCS ? "All FCS teams" : CONFS[i]!.name;
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
      text: `${CONFS[i]!.id} vs ${CONFS[j]!.id} · ${hasGames(x) ? `${fmtWL(x)} · ${fmtPct(x)}` : "No games"}`,
    };
  },

  // Detail panel ---------------------------------------------------------

  get detail() {
    const [i, j] = this.selected, x = this.r(i, j), n = x.w + x.l;
    const lead = x.w - x.l;
    const verdict = !n ? "These conferences haven't met in the selected seasons."
      : lead === 0 ? `The series is even over ${n} games.`
      : `${lead > 0 ? name(i) : name(j)} leads the series by ${Math.abs(lead)} game${Math.abs(lead) === 1 ? "" : "s"} across ${n} meetings.`;
    const rowWon = (k: number) => {
      const g = ds.games[k]!;
      const homeIsRow = (this.membership === "now" ? ds.current[g[2]] : g[4]) === i;
      return homeIsRow === (g[6] > g[7]);
    };
    const last5 = x.games.slice(0, 5), w5 = last5.filter(rowWon).length;
    const f = this.filters();
    return {
      a: name(i), b: name(j), aId: CONFS[i]!.id, bId: CONFS[j]!.id,
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

  get updated(): string {
    if (!this.lastGame) return "";
    const d = new Date(`${this.lastGame}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  },
}));

Alpine.start();
