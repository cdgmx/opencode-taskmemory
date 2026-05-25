# @cdgmx/opencode-taskmemory

## [Unreleased]

### Major Changes

- **BREAKING:** Removed the `./tools` package subpath export (`@cdgmx/opencode-taskmemory/tools`).

  The package is now **plugin-first only**. The root export (`@cdgmx/opencode-taskmemory`) is the sole public consumer surface.

  **Migration:** If you were importing `createTools` or `resolveMemoryRoot` from the `/tools` subpath, switch to the plugin entry instead:

  ```json
  // opencode.json
  { "plugin": ["@cdgmx/opencode-taskmemory"] }
  ```

  All six `taskMemory_*` tools are registered automatically by the plugin — no factory import required.

  Repo-local dogfooding now points directly at `src/index.ts` via a `file://` URL — this is not a public API.

## 0.3.0

### Minor Changes

- 058769a: fix root memory

## 0.2.0

### Minor Changes

- cdaace1: Initial release of `@cdgmx/opencode-taskmemory`.

  Includes:

  - Six session-scoped tools: `currentSession`, `write`, `append`, `read`, `list`, `deleteMemory`
  - Portable memory root resolution: explicit option → `OPENCODE_TASKMEMORY_ROOT` env var → `os.tmpdir()/opencode/task/memory`
  - `createTools(root?)` factory for deterministic root injection
  - Regression tests for path safety, CRUD, and root precedence
  - GitHub Actions + Changesets release automation
