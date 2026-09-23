# Conference Battle

A web app showing how FBS conferences have fared against each other, with records aggregated at the conference level rather than by team. Game data comes from the [CollegeFootballData.com](https://collegefootballdata.com) API, and each game counts toward the conferences both teams belonged to in the season it was played.

The site is fully static. A build script pulls game data ahead of time, and the page itself is plain TypeScript with [Alpine.js](https://alpinejs.dev), built with [Bun](https://bun.sh) and hosted on GitHub Pages.

## Development

You need Bun 1.3 or later.

```sh
bun install
bun run dev        # dev server with hot reload
bun test           # unit tests
bun run typecheck  # TypeScript checks
bun run build      # production build into dist/
```

To download game data, copy `.env.example` to `.env`, add a free API key from https://collegefootballdata.com/key, and run `bun run fetch-data 2025`.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which typechecks, tests, builds, and publishes `dist/` to GitHub Pages. Pages must be enabled in the repository settings with "GitHub Actions" as the source.
