import { join } from "node:path"
import { tmpdir } from "node:os"

export function resolveMemoryRoot(explicitRoot?: string): string {
  if (explicitRoot) {
    return explicitRoot
  }
  if (process.env.OPENCODE_TASKMEMORY_ROOT) {
    return process.env.OPENCODE_TASKMEMORY_ROOT
  }
  return join(tmpdir(), "opencode", "task", "memory")
}
