# Conference Battle

A web app showing how FBS conferences have fared against each other, with records aggregated at the conference level rather than by team. Game data comes from the [CollegeFootballData.com](https://collegefootballdata.com) API, and each game counts toward the conferences both teams belonged to in the season it was played.

The site is fully static. Game results are downloaded at build time into `data/seasons/`, one file per season, and the page itself is plain TypeScript with [Alpine.js](https://alpinejs.dev), built with [Bun](https://bun.sh) and hosted on GitHub Pages. It's live at [conferencebattle.com](https://conferencebattle.com).

This is a hobby project maintained in spare time. Issues and pull requests are welcome, but responses may be slow; see [CONTRIBUTING.md](CONTRIBUTING.md) before starting on a change.

## Development

You need Bun 1.3 or later and a free CollegeFootballData API key from https://collegefootballdata.com/key. Copy `.env.example` to `.env` and add the key.

```sh
bun install
bun run fetch-data # download game data into data/
bun run dev        # dev server with hot reload
bun test           # unit tests
bun run typecheck  # TypeScript checks
bun run build      # production build into dist/
```

Both `dev` and `build` first run `scripts/build-data.ts`, which combines the season files into the compact `src/generated/games.json` the page loads.

## Game data

The `data/` directory is not committed, because CollegeFootballData's terms of use don't allow republishing its data as a standalone dataset. Instead, each checkout and each deploy downloads its own copy. `bun run fetch-data` fetches the current season plus any earlier season since 2014 that has no file yet, so the first run downloads everything and later runs only refresh the current season. To refetch particular seasons, pass a year or a range, as in `bun run fetch-data 2014-2026`. The script keeps completed games involving at least one FBS team, labels each team with its conference as of that game, and groups FCS opponents together. For the current season it also writes `data/schedule.json`, which holds the week calendar, the AP polls, and the cross-conference games still to be played. The "This week" tab reads that file. Every run also refreshes `data/teams.json`, which maps schools to the CFBD ids their logos are stored under; the page loads the logos from CollegeFootballData's CDN.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which fetches game data, typechecks, tests, builds, and publishes `dist/` to GitHub Pages. The same workflow runs every morning from August through January to pick up new results, and you can run it from the Actions tab with a season range to refetch older seasons. It reads the API key from the `CFBD_API_KEY` repository secret (`gh secret set CFBD_API_KEY`) and keeps past seasons in the Actions cache so each build only downloads the current one. GitHub pauses scheduled workflows in repositories with no activity for 60 days; the workflow re-enables itself on each scheduled run to prevent that, but if updates stop at the start of a season, re-enable it in the Actions tab. Pages must be enabled in the repository settings with "GitHub Actions" as the source. Files in `public/`, such as the link preview image, are copied into the build as they are.

## License

The code is released under the [MIT License](LICENSE). The game data comes from [CollegeFootballData.com](https://collegefootballdata.com) and is not covered by that license; it remains subject to CollegeFootballData.com's own terms of use.
