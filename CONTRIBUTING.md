# Contributing

## Prerequisites

- Node.js 20+
- npm 10+
- GitHub Actions enabled on the repository
- `NPM_TOKEN` secret configured in GitHub repository settings
- `@cdgmx` npm scope with publish rights

## Install

```bash
npm ci
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Pack check

```bash
npm run pack:check
```

## Authoring a changeset

```bash
npm run changeset
```

Commit the generated `.changeset/*.md` file with your PR.

## Release workflow

1. Merge your PR with a changeset to `main`.
2. Changesets opens or updates a release PR.
3. Review generated version and changelog changes.
4. Merge the release PR to publish `@cdgmx/opencode-taskmemory`.
