import { track } from "./lib/analytics.ts";

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
  track(`theme-${next}`);
});
darkQuery.addEventListener("change", labelTheme);
labelTheme();
