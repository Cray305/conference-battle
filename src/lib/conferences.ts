export type ConfId = "SEC" | "B1G" | "B12" | "ACC" | "IND" | "P12" | "AAC" | "MW" | "SBC" | "CUSA" | "MAC" | "FCS";
export type Tier = "P4" | "G5" | "Ind" | "FCS";

export interface Conference {
  id: ConfId;
  name: string;
  tier: Tier;
  /** Conference name as the CollegeFootballData API spells it. FCS teams are matched by classification instead. */
  cfbd?: string;
}

// Index order is the order conferences are stored in the generated data file.
export const CONFS: readonly Conference[] = [
  { id: "SEC", name: "SEC", tier: "P4", cfbd: "SEC" },
  { id: "B1G", name: "Big Ten", tier: "P4", cfbd: "Big Ten" },
  { id: "B12", name: "Big 12", tier: "P4", cfbd: "Big 12" },
  { id: "ACC", name: "ACC", tier: "P4", cfbd: "ACC" },
  { id: "IND", name: "Independents", tier: "Ind", cfbd: "FBS Independents" },
  { id: "P12", name: "Pac-12", tier: "G5", cfbd: "Pac-12" },
  { id: "AAC", name: "American", tier: "G5", cfbd: "American Athletic" },
  { id: "MW", name: "Mountain West", tier: "G5", cfbd: "Mountain West" },
  { id: "SBC", name: "Sun Belt", tier: "G5", cfbd: "Sun Belt" },
  { id: "CUSA", name: "Conference USA", tier: "G5", cfbd: "Conference USA" },
  { id: "MAC", name: "MAC", tier: "G5", cfbd: "Mid-American" },
  { id: "FCS", name: "FCS", tier: "FCS" },
];

export const FCS = CONFS.findIndex((c) => c.id === "FCS");

export const confIndex = (id: ConfId): number => CONFS.findIndex((c) => c.id === id);

const byCfbdName = new Map(CONFS.filter((c) => c.cfbd).map((c) => [c.cfbd!, c.id]));

/** Maps a team's CFBD classification and conference to our conference id, or null for Division II/III teams. */
export function confFromCfbd(classification: string | null | undefined, conference: string | null | undefined): ConfId | null {
  if (classification === "fcs") return "FCS";
  if (classification !== "fbs") return null;
  const id = conference ? byCfbdName.get(conference) : undefined;
  if (!id) throw new Error(`Unknown FBS conference "${conference}". Add it to src/lib/conferences.ts.`);
  return id;
}

export const PRESETS: Record<"p4" | "g5" | "fbs" | "all", ConfId[]> = {
  p4: CONFS.filter((c) => c.tier === "P4").map((c) => c.id),
  g5: CONFS.filter((c) => c.tier === "G5").map((c) => c.id),
  fbs: CONFS.filter((c) => c.id !== "FCS").map((c) => c.id),
  all: CONFS.map((c) => c.id),
};

export const PRESET_LABELS: Record<keyof typeof PRESETS, string> = {
  p4: "Power 4",
  g5: "Group of 5",
  fbs: "All FBS",
  all: "All + FCS",
};
