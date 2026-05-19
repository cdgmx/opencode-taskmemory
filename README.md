# @cdgmx/opencode-taskmemory

Session-scoped markdown file storage tools for [OpenCode](https://opencode.ai) agents — packaged as a directly loadable OpenCode plugin.

---

## What this package provides

| | |
|---|---|
| **Root package** | A ready-to-load OpenCode plugin — add the package name to `opencode.json` and the six tools are available immediately |
| **`/tools` subpath** | The reusable `createTools(root?)` factory for building your own plugin or custom composition |
| **Six tools** | `taskMemory_currentSession`, `taskMemory_write`, `taskMemory_append`, `taskMemory_read`, `taskMemory_list`, `taskMemory_deleteMemory` |

---

## Plugin usage (recommended)

### Step 1 — Install

```bash
npm install @cdgmx/opencode-taskmemory
```

### Step 2 — Register in `opencode.json`

```json
{
  "plugin": ["@cdgmx/opencode-taskmemory"]
}
```

OpenCode loads the package as a plugin at startup. All six `taskMemory_*` tools become available to agents immediately — no wrapper file required.

---

## Library / developer usage

If you are building your own plugin or agent tooling and want to compose the tool definitions directly, import from the `/tools` subpath:

```ts
import { createTools, resolveMemoryRoot } from "@cdgmx/opencode-taskmemory/tools"

const tools = createTools("/my/custom/root")
// or with default root resolution:
const tools = createTools()
```

> **Migration note for previous users:** The package root (`@cdgmx/opencode-taskmemory`) is now the plugin entry. Move any direct tool imports to `@cdgmx/opencode-taskmemory/tools`.

---

## Storage root resolution

Precedence (highest to lowest):

1. Explicit argument: `createTools("/my/path")`
2. Environment variable: `OPENCODE_TASKMEMORY_ROOT`
3. Default: `os.tmpdir()/opencode/task/memory`

Files are stored at `<root>/<sessionId>/<name>.md`. Session IDs must match the `ses_` prefix pattern returned by OpenCode's runtime context.

---

## Exported API

### Root package (`@cdgmx/opencode-taskmemory`)

| Export | Description |
|---|---|
| `TaskMemoryPlugin` | Named `Plugin` function — the OpenCode plugin entry |
| `default` | Default alias of `TaskMemoryPlugin` |

### Tools subpath (`@cdgmx/opencode-taskmemory/tools`)

| Export | Description |
|---|---|
| `createTools(root?)` | Create tool instances bound to a specific storage root |
| `resolveMemoryRoot(root?)` | Resolve storage root by precedence |

### Tool descriptions

| Tool | Description |
|---|---|
| `taskMemory_currentSession` | Return current session ID and memory directory |
| `taskMemory_write` | Write a new markdown memory file (fails if exists unless `overwrite: true`) |
| `taskMemory_append` | Append to a memory file (creates if missing) |
| `taskMemory_read` | Read a memory file |
| `taskMemory_list` | List `.md` memory files in a session |
| `taskMemory_deleteMemory` | Delete a memory file |

---

## Local dogfooding

`tools/taskMemory.ts` is a source-level bridge used in this repo itself for local OpenCode symlink usage. It calls `createTools` with a fixed local path so the repo's own agents can use the tools without publishing. It is not part of the public API.

---

## Development

```bash
npm ci
npm run build
npm test
npm run pack:check
```

## Release

- Add a changeset with `npm run changeset`
- Merge PR to `main`
- Changesets opens a release PR
- Merge release PR to publish
