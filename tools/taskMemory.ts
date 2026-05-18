import { createTools } from "../src/index.js"

const tools = createTools("/Users/christian/.config/opencode/temp/task/memory")

export const currentSession = tools.currentSession
export const write = tools.write
export const append = tools.append
export const read = tools.read
export const list = tools.list
export const deleteMemory = tools.deleteMemory
