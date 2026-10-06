import type { NowPlaying, Reaction } from '../types'

export const POLL_MS = 1000
export const FRAME_MS = 350
export const SLEEP_AFTER_MS = 2_000
export const STALE_AFTER_MS = 15_000
export const TASK_NAME = 'Clawd Spotify Watch'
export const SLEEP_TICKS = 3
export const IDLE_TICKS = 2
export const REACTION_MS = 5_000
export const LISTEN_MS = 2_000
export const BORED_AFTER_MS = 120_000

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
  { notes: '  ♪   ♫     ', eq: '▆▂▇▄', body: ['  ╭─────╮   ', ' ▘▐▙███▟▌▝  ', '  ▜█████▛   ', '   ▝▘ ▝▘    '] },
  { notes: '         ♪  ', eq: '▃▇▅▂', body: ['    ╭─────╮ ', '    ▐▛███▜▌ ', '   ▝▜█████▛▖', '     ▘▘ ▝▝  '] },
]

export const SLEEP_FRAMES = [
  { zs: ['            ', '         z  '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['            ', '        z Z '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['          Z ', '        z  z'], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['         Z  ', '            '], body: ['  ▐▀███▀▌   ', '  ▜█████▛   ', '   ▘▘ ▝▝    '] },
  { zs: ['            ', '         o  '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
  { zs: ['         O  ', '            '], body: ['  ▐▀███▀▌   ', ' ▝▜█████▛▘  ', '   ▘▘ ▝▝    '] },
]

type Face = '▛███▜' | '▜██▛█' | '█▜██▛' | '▙███▟' | '█████' | '▀███▀' | 'x███x' | 'o███o'
const AHEAD: Face = '▛███▜', LEFT: Face = '▜██▛█', RIGHT: Face = '█▜██▛', UP: Face = '▙███▟', BLINK: Face = '█████'
const SHUT: Face = '▀███▀', DIZZY: Face = 'x███x', WIDE: Face = 'o███o'

type Rows = [string, string, string]

const HEAD = (face: Face) => `  ▐${face}▌   `
const ARMS = ' ▝▜█████▛▘  '
const LEGS = '   ▘▘ ▝▝    '
// Both arms up beside the head, the body bare beneath them.
const CHEER = (face: Face): Rows => [` ▗▐${face}▌▖  `, '  ▜█████▛   ', '   ▝▘ ▝▘    ']

function awake(face: Face, dx = 0): Rows {
  const shift = (row: string) => (' '.repeat(dx) + row).slice(0, 12)

  return [shift(HEAD(face)), shift(ARMS), shift(LEGS)]
}

// One hand raised and waving: `hand` is the corner of the block it shows.
const wave = (hand: '▖' | '▗'): Rows => [`  ▐${AHEAD}▌${hand}  `, ' ▝▜█████▛   ', LEGS]
const tap: Rows = [HEAD(AHEAD), ARMS, '   ▘▘ ▝▗    ']

export const IDLE_FRAMES: Rows[] = [
  awake(AHEAD), awake(AHEAD), awake(AHEAD), awake(AHEAD), awake(BLINK), awake(AHEAD), awake(AHEAD),
  awake(LEFT), awake(AHEAD), awake(AHEAD), awake(RIGHT), awake(AHEAD), awake(AHEAD),
  awake(AHEAD), awake(BLINK), awake(AHEAD), awake(AHEAD, 1), awake(AHEAD, 1), awake(AHEAD, 1),
  awake(AHEAD), awake(AHEAD), awake(UP), awake(AHEAD), awake(AHEAD),
  wave('▖'), wave('▗'), wave('▖'), wave('▗'), awake(AHEAD), awake(AHEAD),
  awake(AHEAD), CHEER(UP), CHEER(UP), awake(BLINK), awake(AHEAD), awake(AHEAD),
]

// A mood drawn as a row above Clawd (stars, confetti, dots) and his three rows.
// `keys` is a 6-wide column right of the top row and each body row.
export type Pose = { top: string; rows: Rows; keys?: [string, string, string, string] }

// What Clawd shows the moment a turn ends, for REACTION_MS.
export const REACTIONS: Record<Reaction, { frames: Pose[]; ticks: number; label: string; color: 'warning' | 'error' | 'suggestion' }> = {
  celebrating: {
    ticks: 1,
    label: 'all done!',
    color: 'warning',
    frames: [
      { top: ' *    +   * ', rows: awake(UP) },
      { top: '   +  *  ·  ', rows: CHEER(UP) },
      { top: ' ·  *    +  ', rows: awake(UP) },
      { top: '  *   · *   ', rows: CHEER(UP) },
    ],
  },
  dizzy: {
    ticks: 2,
    label: 'ouch, something went wrong',
    color: 'error',
    frames: [
      { top: '  *  ·  °   ', rows: awake(DIZZY) },
      { top: '   ·  °  *  ', rows: awake(DIZZY, 1) },
      { top: '  °  *  ·   ', rows: awake(DIZZY) },
      { top: '   *  ·  °  ', rows: awake(DIZZY, 1) },
    ],
  },
  startled: {
    ticks: 2,
    label: 'whoa, stopping!',
    color: 'suggestion',
    frames: [
      { top: '     !      ', rows: CHEER(WIDE) },
      { top: '     !      ', rows: awake(WIDE) },
      { top: '            ', rows: awake(WIDE) },
      { top: '            ', rows: awake(BLINK) },
      { top: '            ', rows: awake(AHEAD) },
      { top: '            ', rows: awake(AHEAD) },
    ],
  },
}

// You are typing: keys float up beside Clawd and his eyes follow the highest one.
const KEYS = ['a', 's', '⏎', 'k', '␣', 'e', '⌫', 't', 'j', '⇥', 'r', 'n']
const KEY_COLUMNS = [1, 4, 2, 5, 0, 3, 4, 1, 5, 2, 0, 3]
const LISTEN_LENGTH = 12

export const LISTEN_FRAMES: Pose[] = Array.from({ length: LISTEN_LENGTH }, (_, f) => {
  const keys: [string, string, string, string] = ['      ', '      ', '      ', '      ']
  let highest = 4

  // A key is spawned on every even frame and rises one row per frame.
  for (let spawn = 0; spawn < LISTEN_LENGTH; spawn += 2) {
    const row = 3 - ((f - spawn + LISTEN_LENGTH) % LISTEN_LENGTH)

    if (row >= 0 && row <= 3) {
      const cells = keys[row].split('')
      cells[KEY_COLUMNS[spawn]!] = KEYS[spawn]!
      keys[row] = cells.join('')
      highest = Math.min(highest, row)
    }
  }

  const face = highest === 0 ? UP : highest < 4 ? RIGHT : AHEAD

  return { top: '            ', rows: awake(face), keys }
})

// A conversation is going but nobody has said anything for a while.
export const BORED_FRAMES: Pose[] = [
  { top: '            ', rows: awake(AHEAD) },
  { top: '            ', rows: tap },
  { top: '            ', rows: awake(AHEAD) },
  { top: '            ', rows: tap },
  { top: '            ', rows: awake(LEFT) },
  { top: '            ', rows: awake(AHEAD) },
  { top: '         o  ', rows: awake(SHUT) },
  { top: '        O   ', rows: awake(SHUT) },
  { top: '            ', rows: awake(SHUT) },
  { top: '            ', rows: awake(BLINK) },
  { top: '            ', rows: awake(UP) },
  { top: '            ', rows: awake(AHEAD) },
]

// How a turn's end makes Clawd react: only the main conversation's turns count.
export function reactionFor(reason: string): Reaction {
  if (reason === 'answer') {
    return 'celebrating'
  }

  return reason === 'aborted' ? 'startled' : 'dizzy'
}

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
