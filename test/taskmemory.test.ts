import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { ToolContext } from "@opencode-ai/plugin"
import { createTools, resolveMemoryRoot } from "../src/tools.js"
import { TaskMemoryPlugin } from "../src/index.js"

async function makeTempRoot(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "taskmemory-test-"))
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

function makeContext(sessionID: string): ToolContext {
  return {
    sessionID,
    messageID: "msg_test",
    agent: "test-agent",
    directory: tmpdir(),
    worktree: tmpdir(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => { throw new Error("ask not supported in tests") }
  } as unknown as ToolContext
}

function extractOutput(result: string | { output: string; metadata?: Record<string, unknown> }): string {
  return typeof result === "string" ? result : result.output
}

const VALID_SESSION = "ses_abc123"
const MOCK_CTX = makeContext(VALID_SESSION)

describe("session ID validation", () => {
  it("rejects empty sessionId", async () => {
    const { root, cleanup } = await makeTempRoot()
    try {
      const tools = createTools(root)
      const result = extractOutput(await tools.write.execute({ sessionId: "", name: "test.md", content: "x" }, MOCK_CTX))
      expect(result).toMatch(/Error/)
    } finally {
      await cleanup()
    }
  })

  it("rejects sessionId without ses_ prefix", async () => {
    const { root, cleanup } = await makeTempRoot()
    try {
      const tools = createTools(root)
      const result = extractOutput(await tools.write.execute({ sessionId: "invalid_id", name: "test.md", content: "x" }, MOCK_CTX))
      expect(result).toMatch(/Error/)
    } finally {
      await cleanup()
    }
  })

  it("rejects sessionId with path traversal characters", async () => {
    const { root, cleanup } = await makeTempRoot()
    try {
      const tools = createTools(root)
      const result = extractOutput(await tools.write.execute({ sessionId: "ses_../etc", name: "test.md", content: "x" }, MOCK_CTX))
      expect(result).toMatch(/Error/)
    } finally {
      await cleanup()
    }
  })
})

describe("memory name path traversal", () => {
  it("rejects name with directory separator", async () => {
    const { root, cleanup } = await makeTempRoot()
    try {
      const tools = createTools(root)
      const result = extractOutput(await tools.write.execute({ sessionId: VALID_SESSION, name: "../escape.md", content: "x" }, MOCK_CTX))
      expect(result).toMatch(/Error/)
    } finally {
      await cleanup()
    }
  })
})

describe("write/read/append/list/delete", () => {
  it("supports CRUD flow", async () => {
    const { root, cleanup } = await makeTempRoot()
    try {
      const tools = createTools(root)
      await tools.write.execute({ sessionId: VALID_SESSION, name: "note.md", content: "one" }, MOCK_CTX)
      await tools.append.execute({ sessionId: VALID_SESSION, name: "note.md", content: "\ntwo" }, MOCK_CTX)
      const readResult = JSON.parse(extractOutput(await tools.read.execute({ sessionId: VALID_SESSION, name: "note.md" }, MOCK_CTX)))
      expect(readResult.content).toBe("one\ntwo")
      const listResult = JSON.parse(extractOutput(await tools.list.execute({ sessionId: VALID_SESSION }, MOCK_CTX)))
      expect(listResult.files).toContain("note.md")
      const deleteResult = JSON.parse(extractOutput(await tools.deleteMemory.execute({ sessionId: VALID_SESSION, name: "note.md" }, MOCK_CTX)))
      expect(deleteResult.status).toBe("deleted")
    } finally {
      await cleanup()
    }
  })
})

describe("resolveMemoryRoot precedence", () => {
  const originalEnv = process.env.OPENCODE_TASKMEMORY_ROOT

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OPENCODE_TASKMEMORY_ROOT
    } else {
      process.env.OPENCODE_TASKMEMORY_ROOT = originalEnv
    }
  })

  it("explicit option takes highest priority", () => {
    process.env.OPENCODE_TASKMEMORY_ROOT = "/from/env"
    expect(resolveMemoryRoot("/explicit/root")).toBe("/explicit/root")
  })

  it("env var is used when no explicit option", () => {
    process.env.OPENCODE_TASKMEMORY_ROOT = "/from/env"
    expect(resolveMemoryRoot()).toBe("/from/env")
  })

  it("falls back to tmpdir path", () => {
    delete process.env.OPENCODE_TASKMEMORY_ROOT
    expect(resolveMemoryRoot()).toBe(join(tmpdir(), "opencode", "task", "memory"))
  })
})

describe("plugin entry smoke", () => {
  it("TaskMemoryPlugin is a callable function", () => {
    expect(typeof TaskMemoryPlugin).toBe("function")
  })

  it("plugin resolves to hooks with all six taskMemory_* tools", async () => {
    // Cast to satisfy PluginInput shape without a real client — plugin only calls createTools() internally
    const hooks = await TaskMemoryPlugin({} as Parameters<typeof TaskMemoryPlugin>[0])
    expect(hooks).toHaveProperty("tool")
    const toolKeys = Object.keys(hooks.tool ?? {})
    expect(toolKeys).toEqual(expect.arrayContaining([
      "taskMemory_currentSession",
      "taskMemory_write",
      "taskMemory_append",
      "taskMemory_read",
      "taskMemory_list",
      "taskMemory_deleteMemory",
    ]))
    expect(toolKeys).toHaveLength(6)
  })
})
