# @cdgmx/opencode-taskmemory

Session-scoped markdown file storage tools for [OpenCode](https://opencode.ai) agents.

## Install

```bash
npm install @cdgmx/opencode-taskmemory
```

## Usage

### Default tools

```ts
import { currentSession, write, append, read, list, deleteMemory } from "@cdgmx/opencode-taskmemory"
```

Default root precedence:

1. explicit `createTools(root)` argument
2. `OPENCODE_TASKMEMORY_ROOT`
3. `os.tmpdir()/opencode/task/memory`

### Custom root

```ts
import { createTools } from "@cdgmx/opencode-taskmemory"

const tools = createTools("/my/custom/root")
```

## Exported tools

| Export | Description |
|---|---|
| `currentSession` | Return current session ID and memory directory |
| `write` | Write a new markdown memory file |
| `append` | Append to a memory file |
| `read` | Read a memory file |
| `list` | List `.md` memory files in a session |
| `deleteMemory` | Delete a memory file |
| `createTools(root?)` | Create tool instances bound to a specific root |
| `resolveMemoryRoot(root?)` | Resolve memory root by precedence |

## Local dogfooding

This repo includes `tools/taskMemory.ts` as a source-level bridge for local OpenCode symlink usage from another repo.

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
