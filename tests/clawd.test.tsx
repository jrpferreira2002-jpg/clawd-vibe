import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  FRAME_MS,
  FRAMES,
  IDLE_FRAMES,
  IDLE_TICKS,
  SLEEP_AFTER_MS,
  SLEEP_FRAMES,
  SLEEP_TICKS,
  STALE_AFTER_MS,
  parseStatus,
} from '../hooks/clawd'

const SURFACES = ['terminal', 'desktop'] as const
const NOW = 1_800_000_000_000
const TRACK = 'Daft Punk - Around the World'
const DEFAULT_FILE = 'C:\\Users\\Ferreira\\clawd\\.clawd-spotify.json'
const OPTS = { options: { statusFile: DEFAULT_FILE } }
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

// The world beneath the mod: a clock the test moves, the watcher's file, the
// turn count, and the engine's own band.
function world(on: On) {
  const clock = mock.clock(on, { now: NOW })
  const state = { isPlaying: false, turns: 0, reads: [] as string[] }

  on('fs.read', ($, e) => {
    state.reads.push(e.path)

    return {
      value: JSON.stringify({
        isPlaying: state.isPlaying,
        track: state.isPlaying ? TRACK : '',
        ts: clock.now(),
      }),
    }
  })
  on('command.register', () => ({ value: undefined as never }))
  on('session.turns', () => ({ value: state.turns }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE BAND</Text>
  })

  return { clock, state }
}

const start = ($: Engine) =>
  $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const mount = ($: Engine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ plugin: 'clawd-vibe', surface, component: 'AbovePrompt', props: PROPS })

type Band = Awaited<ReturnType<typeof mount>>

const shown = async (ui: Band) =>
  (await ui.findAll({ type: 'Text' })).map(text => text.text).join('\n')

// How many different drawings a number of animation ticks goes through.
async function drawings(ui: Band, clock: { advance: (ms: number) => Promise<void> }, ticks: number) {
  const seen = new Set<string>()

  for (let i = 0; i < ticks; i++) {
    seen.add(await shown(ui))
    await clock.advance(FRAME_MS)
  }

  return seen
}

describe('parseStatus', () => {
  const fresh = JSON.stringify({ isPlaying: true, track: TRACK, ts: NOW - 1000 })

  test('fresh and playing is playing', () => {
    expect(parseStatus(fresh, NOW)).toEqual({ isPlaying: true, track: TRACK })
  })

  test('a leading BOM is stripped', () => {
    expect(parseStatus('\uFEFF' + fresh, NOW)).toEqual({ isPlaying: true, track: TRACK })
  })

  test('a stale status is silent', () => {
    expect(parseStatus(fresh, NOW + STALE_AFTER_MS).isPlaying).toBe(false)
  })

  test('isPlaying false is silent', () => {
    const paused = JSON.stringify({ isPlaying: false, track: '', ts: NOW })
    expect(parseStatus(paused, NOW).isPlaying).toBe(false)
  })

  test('truncated JSON is silent', () => {
    expect(parseStatus(fresh.slice(0, 20), NOW).isPlaying).toBe(false)
  })
})

for (const surface of SURFACES) {
  describe(surface, () => {
    test('playing and idle: vibing above the engine band, animated', OPTS, async ($, on) => {
      const { clock, state } = world(on)
      state.isPlaying = true
      await start($)
      const ui = await mount($, surface)

      const before = await shown(ui)
      expect(before).toContain(`vibing to ${TRACK}`)
      expect(before).toContain('ENGINE BAND')

      await clock.advance(FRAME_MS)
      expect(await shown(ui)).not.toBe(before)

      await ui.redraw({ ...PROPS, isWorking: true })
      expect(await shown(ui)).toBe('ENGINE BAND')
      await ui.unmount()
    })

    test('music stops: vibing through a blip, then asleep and animated', OPTS, async ($, on) => {
      const { clock, state } = world(on)
      state.isPlaying = true
      await start($)
      const ui = await mount($, surface)

      state.isPlaying = false
      await clock.advance(1000)
      expect(await shown(ui)).toContain('vibing to')

      await clock.advance(SLEEP_AFTER_MS)
      const asleep = await shown(ui)
      expect(asleep).toContain('sleeping…')
      expect(asleep).not.toContain('vibing to')
      expect(asleep).toContain('ENGINE BAND')

      const seen = await drawings(ui, clock, SLEEP_FRAMES.length * SLEEP_TICKS)
      expect(seen.size).toBeGreaterThan(1)
      await ui.unmount()
    })

    test('a turn wakes Clawd, a /clear puts him back to sleep', OPTS, async ($, on) => {
      const { clock, state } = world(on)
      await start($)
      const ui = await mount($, surface)
      expect(await shown(ui)).toContain('sleeping…')

      await $.turn.start({ text: 'hi', turnId: 't1' })
      state.turns = 1
      expect(await shown(ui)).not.toContain('sleeping…')

      const seen = await drawings(ui, clock, IDLE_FRAMES.length * IDLE_TICKS)
      expect(seen.size).toBeGreaterThan(3)
      expect([...seen].join('\n')).not.toContain('sleeping…')

      await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
      expect(await shown(ui)).toContain('sleeping…')
      await clock.advance(3000)
      expect(await shown(ui)).toContain('sleeping…')

      await $.turn.start({ text: 'again', turnId: 't2' })
      expect(await shown(ui)).not.toContain('sleeping…')
      await ui.unmount()
    })

    test('a /clear while music plays never interrupts the vibing', OPTS, async ($, on) => {
      const { clock, state } = world(on)
      state.isPlaying = true
      state.turns = 1
      await start($)
      const ui = await mount($, surface)

      await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
      expect(await shown(ui)).toContain('vibing to')

      for (const drawing of await drawings(ui, clock, 12)) {
        expect(drawing).toContain('vibing to')
        expect(drawing).not.toContain('sleeping…')
      }

      await ui.unmount()
    })
  })
}

test('reads the configured status file', OPTS, async ($, on) => {
  const { state } = world(on)
  await start($)
  expect(state.reads).toContain(DEFAULT_FILE)
})

test(
  'reads the statusFile option',
  { options: { statusFile: 'D:\\music\\.clawd-spotify.json' } },
  async ($, on) => {
    const { clock, state } = world(on)
    await start($)
    await clock.advance(1000)
    expect(new Set(state.reads)).toEqual(new Set(['D:\\music\\.clawd-spotify.json']))
  },
)

test('autostart off: installs nothing', OPTS, async ($, on) => {
  world(on)
  const ran: string[][] = []
  on('process.run', (_$, e) => {
    ran.push([...e.argv])

    return { value: { exitCode: e.argv[0] === 'schtasks' ? 1 : 0, stdout: 'installed', stderr: '' } as never }
  })
  await start($)
  expect(ran).toEqual([])
})

test(
  'autostart on: queries the task, then runs the install script with the status file',
  { options: { statusFile: DEFAULT_FILE, autostart: true } },
  async ($, on) => {
    const { clock } = world(on)
    const ran: string[][] = []
    on('process.run', (_$, e) => {
      ran.push([...e.argv])

      return { value: { exitCode: e.argv[0] === 'schtasks' ? 1 : 0, stdout: 'installed', stderr: '' } as never }
    })
    await start($)
    await clock.settle()
    expect(ran[0]).toEqual(['schtasks', '/Query', '/TN', 'Clawd Spotify Watch'])
    expect(ran[1]!.at(-2)).toBe('-StatusFile')
    expect(ran[1]!.at(-1)).toBe(DEFAULT_FILE)
    expect(ran[1]!.some(arg => arg.endsWith('install-watcher.ps1'))).toBe(true)
  },
)

describe('frames', () => {
  test('every row in a set is equally wide', () => {
    const rows = [
      ...FRAMES.flatMap(frame => [frame.notes, ...frame.body]),
      ...SLEEP_FRAMES.flatMap(frame => [...frame.zs, ...frame.body]),
      ...IDLE_FRAMES.flat(),
    ]

    for (const row of rows) {
      expect([...row].length, JSON.stringify(row)).toBe(12)
    }

    expect(new Set(FRAMES.map(frame => [...frame.eq].length)).size).toBe(1)
  })

  test('the headband sits directly above the head', () => {
    for (const { body } of FRAMES) {
      expect(body[0]!.indexOf('╭')).toBe(body[1]!.indexOf('▐'))
      expect(body[0]!.indexOf('╮')).toBe(body[1]!.indexOf('▌'))
    }
  })
})
