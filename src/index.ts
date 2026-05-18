import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile, appendFile, readFile, readdir, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { resolveMemoryRoot } from "./root.js"

export { resolveMemoryRoot } from "./root.js"

const SESSION_ID_PATTERN = /^ses_[a-zA-Z0-9_-]+$/

function sanitizeSegment(segment: string): string {
  const stripped = segment.replace(/[/\\]/g, "")
  const cleaned = stripped.replace(/[^a-zA-Z0-9\-_.]/g, "_")
  return cleaned.replace(/^\.+/, "_")
}

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

function ensureMdExtension(name: string): string {
  return name.endsWith(".md") ? name : `${name}.md`
}

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

async function resolveSessionDir(sessionId: string, memoryRoot: string): Promise<string> {
  const dir = join(memoryRoot, sessionId)
  await mkdir(dir, { recursive: true })
  return dir
}

async function resolveMemoryPath(sessionId: string, name: string, memoryRoot: string): Promise<string> {
  const sessionDir = await resolveSessionDir(sessionId, memoryRoot)
  const candidate = resolve(join(sessionDir, name))
  if (!candidate.startsWith(sessionDir + "/") && candidate !== sessionDir) {
    throw new Error(`Path traversal detected: ${candidate}`)
  }
  return candidate
}

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

const defaultTools = createTools()

export const currentSession = defaultTools.currentSession
export const write = defaultTools.write
export const append = defaultTools.append
export const read = defaultTools.read
export const list = defaultTools.list
export const deleteMemory = defaultTools.deleteMemory
