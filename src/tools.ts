import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile, appendFile, readFile, readdir, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { resolveMemoryRoot } from "./root.js"

export { resolveMemoryRoot } from "./root.js"

const SESSION_ID_PATTERN = /^ses_[a-zA-Z0-9_-]+$/

/**
 * @purpose Strip directory separators and sanitize a path segment to safe characters.
 * @params segment - raw string from user input
 * @returns sanitized string safe for use as a file or directory name
 */
function sanitizeSegment(segment: string): string {
  const stripped = segment.replace(/[/\\]/g, "")
  const cleaned = stripped.replace(/[^a-zA-Z0-9\-_.]/g, "_")
  return cleaned.replace(/^\.+/, "_")
}

/**
 * @purpose Validate and normalize an OpenCode session ID.
 * @params sessionId - raw session id string from tool args or context
 * @returns validated session id string
 * @note Throws if the session id is empty, malformed, or does not match the ses_ prefix pattern.
 */
function normalizeSessionId(sessionId: string): string {
  if (!sessionId) {
    throw new Error("sessionId is required. Call taskMemory_currentSession first and pass that exact value.")
  }
  const sanitized = sanitizeSegment(sessionId)
  if (sanitized !== sessionId || !SESSION_ID_PATTERN.test(sanitized)) {
    throw new Error(`Invalid sessionId "${sessionId}". Expected an OpenCode session id starting with "ses_".`)
  }
  return sanitized
}

/**
 * @purpose Ensure a memory file name ends with the .md extension.
 * @params name - raw file name, with or without extension
 * @returns name guaranteed to end with .md
 */
function ensureMdExtension(name: string): string {
  return name.endsWith(".md") ? name : `${name}.md`
}

/**
 * @purpose Validate and normalize a memory file name for safe filesystem use.
 * @params name - raw memory name from tool args
 * @returns sanitized file name ending in .md
 * @note Throws on empty input, path traversal characters, or names that sanitize differently than input.
 */
function normalizeMemoryName(name: string): string {
  if (!name) {
    throw new Error("name is required.")
  }
  const withExtension = ensureMdExtension(name)
  const sanitized = sanitizeSegment(withExtension)
  if (sanitized !== withExtension) {
    throw new Error(`Invalid memory name "${name}". Use a single packet-scoped file name with letters, numbers, dots, dashes, and underscores only.`)
  }
  if (!sanitized.endsWith(".md")) {
    throw new Error(`Invalid memory name "${name}". Canonical memory names must end with .md.`)
  }
  return sanitized
}

/**
 * @purpose Resolve or create the session-scoped directory under the memory root.
 * @params sessionId - validated session id
 * @params memoryRoot - resolved memory root path
 * @returns absolute path to the session directory (created if missing)
 */
async function resolveSessionDir(sessionId: string, memoryRoot: string): Promise<string> {
  const dir = join(memoryRoot, sessionId)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * @purpose Resolve the absolute path for a named memory file within a session directory.
 * @params sessionId - validated session id
 * @params name - validated memory file name
 * @params memoryRoot - resolved memory root path
 * @returns absolute file path
 * @note Throws on path traversal attempts.
 */
async function resolveMemoryPath(sessionId: string, name: string, memoryRoot: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId, memoryRoot)
  const candidate = resolve(join(sessionDir, name))
  if (!candidate.startsWith(sessionDir + "/") && candidate !== sessionDir) {
    throw new Error(`Path traversal detected: ${candidate}`)
  }
  return candidate
}

/**
 * @purpose Factory that creates the six task-memory tool instances bound to a specific storage root.
 * @params memoryRoot - optional explicit storage root path; falls back to env var then tmpdir default
 * @returns object with currentSession, write, append, read, list, deleteMemory tool instances
 * @example
 *   const tools = createTools("/my/custom/root")
 *   // or with default root resolution:
 *   const tools = createTools()
 */
export function createTools(memoryRoot?: string) {
  const root = resolveMemoryRoot(memoryRoot)

  const currentSession = tool({
    description: "Return the current OpenCode session id and its task memory directory. Orchestrators must call this before shared task-memory handoff and pass the returned sessionId unchanged.",
    args: {},
    async execute(_args: Record<string, never>, context: { sessionID: string }) {
      try {
        const sessionId = normalizeSessionId(context.sessionID)
        const sessionDir = await resolveSessionDir(sessionId, root)
        return JSON.stringify({ status: "ok", sessionId, sessionDir })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  const write = tool({
    description: "Write a markdown memory file for an explicit OpenCode session. Fails if the file already exists unless overwrite is true. Use to persist subagent handoff context, evidence blobs, or structured notes.",
    args: {
      sessionId: tool.schema.string().describe("Required OpenCode session id returned by taskMemory_currentSession. Must start with 'ses_'."),
      name: tool.schema.string().describe("Packet-scoped memory file name, with or without .md. A .md extension is added automatically."),
      content: tool.schema.string().describe("Markdown content to write to the memory file."),
      overwrite: tool.schema.boolean().optional().describe("Set true only when intentionally replacing an existing memory file.")
    },
    async execute(args: { sessionId: string; name: string; content: string; overwrite?: boolean }) {
      try {
        const sid = normalizeSessionId(args.sessionId)
        const fileName = normalizeMemoryName(args.name)
        const filePath = await resolveMemoryPath(sid, fileName, root)
        if (!args.overwrite && existsSync(filePath)) {
          return `Error: Memory file already exists: ${filePath}. Use taskMemory_append or pass overwrite: true.`
        }
        await writeFile(filePath, args.content, "utf-8")
        return JSON.stringify({ status: "written", sessionId: sid, name: fileName, path: filePath, bytes: Buffer.byteLength(args.content, "utf-8") })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  const append = tool({
    description: "Append markdown content to a memory file for an explicit OpenCode session. Creates the file if it does not exist. Use to incrementally build up handoff notes across multiple subagent steps.",
    args: {
      sessionId: tool.schema.string().describe("Required OpenCode session id returned by taskMemory_currentSession. Must start with 'ses_'."),
      name: tool.schema.string().describe("Packet-scoped memory file name, with or without .md. A .md extension is added automatically."),
      content: tool.schema.string().describe("Markdown content to append to the memory file.")
    },
    async execute(args: { sessionId: string; name: string; content: string }) {
      try {
        const sid = normalizeSessionId(args.sessionId)
        const fileName = normalizeMemoryName(args.name)
        const filePath = await resolveMemoryPath(sid, fileName, root)
        await appendFile(filePath, args.content, "utf-8")
        return JSON.stringify({ status: "appended", sessionId: sid, name: fileName, path: filePath, appendedBytes: Buffer.byteLength(args.content, "utf-8") })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  const read = tool({
    description: "Read a memory file from an explicit OpenCode session and return its markdown content. Use to retrieve handoff context written by a previous subagent step.",
    args: {
      sessionId: tool.schema.string().describe("Required OpenCode session id returned by taskMemory_currentSession. Must start with 'ses_'."),
      name: tool.schema.string().describe("Canonical memory file name, with or without .md. A .md extension is added automatically.")
    },
    async execute(args: { sessionId: string; name: string }) {
      try {
        const sid = normalizeSessionId(args.sessionId)
        const fileName = normalizeMemoryName(args.name)
        const filePath = await resolveMemoryPath(sid, fileName, root)
        if (!existsSync(filePath)) {
          return JSON.stringify({ status: "not_found", sessionId: sid, name: fileName, path: filePath })
        }
        const content = await readFile(filePath, "utf-8")
        return JSON.stringify({ status: "ok", sessionId: sid, name: fileName, path: filePath, bytes: Buffer.byteLength(content, "utf-8"), content })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  const list = tool({
    description: "List all markdown memory files stored for an explicit OpenCode session. Use for session housekeeping or to recover a known handoff reference.",
    args: {
      sessionId: tool.schema.string().describe("Required OpenCode session id returned by taskMemory_currentSession. Must start with 'ses_'.")
    },
    async execute(args: { sessionId: string }) {
      try {
        const sid = normalizeSessionId(args.sessionId)
        const sessionDir = await resolveSessionDir(sid, root)
        const entries = await readdir(sessionDir)
        const mdFiles = entries.filter((entry) => entry.endsWith(".md"))
        return JSON.stringify({ status: "ok", sessionDir, sessionId: sid, files: mdFiles, count: mdFiles.length })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  const deleteMemory = tool({
    description: "Delete a memory file from an explicit OpenCode session. Use only for explicit cleanup after a handoff is complete.",
    args: {
      sessionId: tool.schema.string().describe("Required OpenCode session id returned by taskMemory_currentSession. Must start with 'ses_'."),
      name: tool.schema.string().describe("Canonical memory file name, with or without .md. A .md extension is added automatically.")
    },
    async execute(args: { sessionId: string; name: string }) {
      try {
        const sid = normalizeSessionId(args.sessionId)
        const fileName = normalizeMemoryName(args.name)
        const filePath = await resolveMemoryPath(sid, fileName, root)
        if (!existsSync(filePath)) {
          return JSON.stringify({ status: "not_found", sessionId: sid, name: fileName, path: filePath })
        }
        await unlink(filePath)
        return JSON.stringify({ status: "deleted", sessionId: sid, name: fileName, path: filePath })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Error: ${msg}`
      }
    }
  })

  return { currentSession, write, append, read, list, deleteMemory }
}
