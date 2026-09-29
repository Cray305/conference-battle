// GoatCounter records page views on its own; this reports clicks as events.
// The script loads async and ad blockers often stop it, so events are dropped
// until it's there. GoatCounter also ignores localhost, so nothing is sent
// from the dev server.
declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event: boolean }) => void };
  }
}

export function track(path: string, title?: string) {
  window.goatcounter?.count?.({ path, title, event: true });
}
