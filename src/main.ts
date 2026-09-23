import Alpine from "alpinejs";
import { winPct } from "./lib/record.ts";

// Keep logic in typed components registered here; the HTML should only
// reference their properties and methods, since Alpine attribute
// expressions aren't type-checked.
Alpine.data("app", () => ({
  message: `Scaffold is running. Sample win pct: ${winPct({ wins: 7, losses: 5 }).toFixed(3)}`,
}));

Alpine.start();
