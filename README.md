# Conference Battle

A web app showing how FBS conferences have fared against each other, with records aggregated at the conference level rather than by team. Game data comes from the [CollegeFootballData.com](https://collegefootballdata.com) API, and each game counts toward the conferences both teams belonged to in the season it was played.

The site is fully static. Game results are downloaded ahead of time into `data/seasons/`, one file per season, and the page itself is plain TypeScript with [Alpine.js](https://alpinejs.dev), built with [Bun](https://bun.sh) and hosted on GitHub Pages.

## Development

You need Bun 1.3 or later.

```sh
bun install
bun run dev        # dev server with hot reload
bun test           # unit tests
bun run typecheck  # TypeScript checks
bun run build      # production build into dist/
```

Both `dev` and `build` first run `scripts/build-data.ts`, which combines the season files into the compact `src/generated/games.json` the page loads.

## Game data

To download games yourself, copy `.env.example` to `.env`, add a free API key from https://collegefootballdata.com/key, and run `bun run fetch-data` for the current season or `bun run fetch-data 2014-2026` for a range. The script keeps completed games involving at least one FBS team, labels each team with its conference as of that game, and groups FCS opponents together.

During the season, `.github/workflows/refresh-data.yml` runs every morning. It fetches the current season, commits any new results, and redeploys the site. It reads the key from the `CFBD_API_KEY` repository secret (`gh secret set CFBD_API_KEY`), and you can also run it from the Actions tab with a season range to backfill. GitHub pauses scheduled workflows in repositories with no activity for 60 days, so if updates stop at the start of a season, re-enable the workflow in the Actions tab.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which typechecks, tests, builds, and publishes `dist/` to GitHub Pages. Pages must be enabled in the repository settings with "GitHub Actions" as the source. Files in `public/`, such as the link preview image, are copied into the build as they are.
