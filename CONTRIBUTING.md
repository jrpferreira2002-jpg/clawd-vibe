# Contributing to clawd-vibe

Thanks for wanting to add something! Contributions are welcome.

## Which branch?

- Open pull requests against **`develop`**, not `main`.
- `main` is the released version. Users install from it, so only the maintainer merges `develop` into `main`
  (and bumps the version) when a release is ready.
- Nothing merged into `develop` is shipped to users until that happens.

## How to contribute

1. Fork the repo and clone your fork.
2. Create a branch from `develop`:
   ```sh
   git checkout develop
   git checkout -b my-feature
   ```
3. Make your change. Keep it focused: one feature or fix per PR.
4. Push to your fork and open a PR with **base branch `develop`** (GitHub defaults to `main`, so change it).
5. Fill in the PR template.

## Guidelines

- Match the style of the surrounding code (naming, comment density, idioms).
- The mod lives in `hooks/`, the Windows Spotify watcher in `scripts/`, and tests in `tests/`.
  Add or update tests in `tests/clawd.test.tsx` when you change behaviour.
- Don't bump `version` in `.claude-plugin/plugin.json`. The maintainer does that at release time.
- Update the README if you add or change a user-visible option or mood.
- If you change the animation, include a short description or screenshot/GIF of how it looks.
- Never commit personal paths, status files (`.clawd-spotify.json`) or secrets.

## Reporting bugs and ideas

Open an issue with your OS, terminal, Claude Code version, and what you expected versus what happened.
For ideas, describe the behaviour you'd like before writing a lot of code.

## License

By contributing you agree your work is released under the project's [MIT license](LICENSE).
