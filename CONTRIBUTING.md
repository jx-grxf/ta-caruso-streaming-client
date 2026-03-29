# Contributing

Thanks for your interest in improving Caruso Reborn.

This project is still primarily maintained by a single author, so the goal of this guide is to keep contributions clear, reviewable, and safe for a network-sensitive desktop app.

## Workflow

- create a dedicated branch for each topic
- use branch names like `fix/...`, `feat/...`, `docs/...`, `chore/...`, `refactor/...`, `test/...`
- open a pull request into `main`
- wait for CI to pass before merging

## Commits

The repo uses Conventional Commits where possible:

- `feat(ui): add ...`
- `fix(server): handle ...`
- `docs(readme): improve ...`
- `chore(github): update ...`

## Pull requests

Good PRs are:

- focused on one problem or feature
- clear about user impact
- tested locally when behavior changes
- small enough to review without guessing

If your PR changes UI, networking, or device behavior, include:

- what changed
- how you tested it
- any limits or risks you noticed

## Development

```bash
npm install
npm run check
npm run build
```

For local iteration:

```bash
npm run dev
```

## Scope notes

This project is designed for trusted local-network use and is tightly coupled to T+A Caruso behavior. Contributions that improve reliability, maintainability, setup clarity, and device compatibility are especially welcome.
