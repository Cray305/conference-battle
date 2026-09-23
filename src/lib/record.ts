export interface Record {
  wins: number;
  losses: number;
}

export function winPct({ wins, losses }: Record): number {
  const games = wins + losses;
  return games === 0 ? 0 : wins / games;
}
