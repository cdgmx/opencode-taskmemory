import type { Plugin } from "@opencode-ai/plugin"
import { createTools } from "./tools.js"

/**
 * @purpose OpenCode plugin entry point for session-scoped task memory tools.
 * @returns Hooks object with the six taskMemory_* tools registered under the `tool` key.
 * @example
 *   // opencode.json
 *   { "plugin": ["@cdgmx/opencode-taskmemory"] }
 */
export const TaskMemoryPlugin: Plugin = async (_input, _options) => {
  const tools = createTools()
  return {
    tool: {
      taskMemory_currentSession: tools.currentSession,
      taskMemory_write: tools.write,
      taskMemory_append: tools.append,
      taskMemory_read: tools.read,
      taskMemory_list: tools.list,
      taskMemory_deleteMemory: tools.deleteMemory,
    },
  }
}

export default TaskMemoryPlugin
