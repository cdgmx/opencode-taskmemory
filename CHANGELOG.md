# @cdgmx/opencode-taskmemory

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
