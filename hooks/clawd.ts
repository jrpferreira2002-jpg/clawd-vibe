import type { NowPlaying } from '../types'

export const POLL_MS = 1000
export const FRAME_MS = 350
export const SLEEP_AFTER_MS = 2_000
export const STALE_AFTER_MS = 15_000
export const TASK_NAME = 'Clawd Spotify Watch'
export const SLEEP_TICKS = 3
export const IDLE_TICKS = 2

export const SILENT: NowPlaying = { isPlaying: false, track: '' }

// The watcher's file: {"isPlaying":true,"track":"Artist - Track","ts":<unix ms>}.
// Anything else (bad JSON, a missing or old ts, not playing) is silence.
export function parseStatus(text: string, now: number): NowPlaying {
  try {
    const status: unknown = JSON.parse(text.replace(/^﻿/, ''))

    if (typeof status !== 'object' || status === null) {
      return SILENT
    }

    const { isPlaying, track, ts } = status as Record<string, unknown>
    const isFresh = typeof ts === 'number' && now - ts <= STALE_AFTER_MS

    if (isPlaying !== true || !isFresh) {
      return SILENT
    }

    return { isPlaying: true, track: typeof track === 'string' ? track : '' }
  } catch {
    return SILENT
  }
}

export const HEADSET = '╭─╮▐▌'

export const FRAMES = [
  { notes: '   ♪        ', eq: '▃▆▂▅', body: ['  ╭─────╮   ', '  ▐▛███▜▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { notes: '        ♫   ', eq: '▅▃▇▂', body: ['   ╭─────╮  ', '   ▐▛███▜▌  ', '  ▝▜█████▛▘ ', '    ▘▘ ▝▝   '] },
  { notes: '  ♫     ♪   ', eq: '▇▅▃▆', body: ['  ╭─────╮   ', ' ▗▐▛███▜▌▖  ', '  ▜█████▛   ', '   ▝▝ ▘▘    '] },
  { notes: '      ♪     ', eq: '▂▇▅▃', body: [' ╭─────╮    ', ' ▐▛███▜▌    ', '▝▜█████▛▘   ', '  ▘▘ ▝▝     '] },
]

export const SLEEP_FRAMES = [
  { zs: ['            ', '         z  '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['            ', '        z Z '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['          Z ', '        z  z'], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['         Z  ', '            '], body: ['  ▐▀███▀▌   ', '  ▜█████▛   ', '   ▘▘ ▝▝    '] },
]

type Face = '▛███▜' | '▜██▛█' | '█▜██▛' | '▙███▟' | '█████'
const AHEAD: Face = '▛███▜', LEFT: Face = '▜██▛█', RIGHT: Face = '█▜██▛', UP: Face = '▙███▟', BLINK: Face = '█████'

function awake(face: Face, dx = 0): [string, string, string] {
  const shift = (row: string) => (' '.repeat(dx) + row).slice(0, 12)

  return [shift(`  ▐${face}▌   `), shift(' ▝▜█████▛▘  '), shift('   ▘▘ ▝▝    ')]
}

export const IDLE_FRAMES = [
  awake(AHEAD), awake(AHEAD), awake(AHEAD), awake(AHEAD), awake(BLINK), awake(AHEAD), awake(AHEAD),
  awake(LEFT), awake(AHEAD), awake(AHEAD), awake(RIGHT), awake(AHEAD), awake(AHEAD),
  awake(AHEAD), awake(BLINK), awake(AHEAD), awake(AHEAD, 1), awake(AHEAD, 1), awake(AHEAD, 1),
  awake(AHEAD), awake(AHEAD), awake(UP), awake(AHEAD), awake(AHEAD),
]

// A body row as runs of headset and body characters, each drawn in its own colour.
export function runs(row: string): { text: string; isHeadset: boolean }[] {
  const out: { text: string; isHeadset: boolean }[] = []

  for (const char of row) {
    const isHeadset = HEADSET.includes(char)
    const last = out.at(-1)

    if (last && last.isHeadset === isHeadset) {
      last.text += char
    } else {
      out.push({ text: char, isHeadset })
    }
  }

  return out
}
