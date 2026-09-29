# Contributing

Thanks for your interest in Conference Battle. This is a hobby project maintained in spare time, so replies to issues and pull requests may take a while, and some suggestions may be declined to keep the site focused.

Bug reports and small fixes are welcome as pull requests directly. For new features or larger changes, please open an issue first to talk through the idea, so you don't spend time on something that won't be merged.

See the [README](README.md#development) for setup. Before opening a pull request, make sure `bun run typecheck` and `bun test` pass, and add tests for changes to the logic in `src/lib/`. You don't need an API key to work on the site, since the game data is already in `data/seasons/`. Please don't include regenerated season files in a pull request unless the change is about the data itself.

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
