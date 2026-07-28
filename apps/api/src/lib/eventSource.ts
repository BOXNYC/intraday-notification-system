import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseQueueEvents, type ParseQueueEventsResult } from '@assembled/types'

// Resolved from this module, not the process working directory, so the feed
// loads the same way regardless of where the server is started from.
// Both src/lib (tsx) and dist/lib (node) sit two levels below the app root.
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FEED_PATH = path.join(APP_ROOT, 'data', 'queue-events.jsonl')

/**
 * Read the queue event feed and parse it into validated events.
 *
 * This is the seam where the local JSONL fixture would be swapped for a real
 * stream — callers only see events and the lines that failed validation.
 */
export function loadQueueEvents(): ParseQueueEventsResult {
  const lines = fs.readFileSync(FEED_PATH, 'utf-8').split('\n').filter(Boolean)
  return parseQueueEvents(lines)
}

/**
 * The feed in ascending event-time order, which is what the rule engine
 * requires — episodes and durations are meaningless out of order. The bundled
 * fixture is not sorted, so sorting happens here rather than in every caller.
 */
export function loadQueueEventsSorted(): ParseQueueEventsResult {
  const { events, rejected } = loadQueueEvents()
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  return { events: sorted, rejected }
}
