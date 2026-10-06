import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { NowPlaying } from '../types'
import {
  FRAME_MS,
  FRAMES,
  IDLE_FRAMES,
  IDLE_TICKS,
  POLL_MS,
  SILENT,
  SLEEP_AFTER_MS,
  TASK_NAME,
  SLEEP_FRAMES,
  SLEEP_TICKS,
  parseStatus,
  runs,
} from './clawd'

const nowPlaying = atom({ plugin: 'clawd-vibe', key: 'nowPlaying' } as const, SILENT)
const frame = atom({ plugin: 'clawd-vibe', key: 'frame' } as const, 0)
const inConversation = atom({ plugin: 'clawd-vibe', key: 'inConversation' } as const, false)

// Registers the Windows scheduled task that runs the watcher at every logon.
// Skipped when the task already exists, unless `force`.
async function installWatcher($: EngineInterface, statusFile: string, force: boolean) {
  if (!statusFile) {
    return 'Set the Spotify status file option for clawd-vibe first, then run this again.'
  }

  try {
    if (!force) {
      const found = await $.process.run(['schtasks', '/Query', '/TN', TASK_NAME])

      if (found.exitCode === 0) {
        return `The '${TASK_NAME}' task already exists.`
      }
    }

    const ran = await $.process.run([
      'powershell',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      `${$.plugin.root}\\scripts\\install-watcher.ps1`,
      '-StatusFile',
      statusFile,
    ])

    return ran.exitCode === 0
      ? ran.stdout.trim()
      : `Could not install the watcher task: ${(ran.stderr || ran.stdout).trim()}`
  } catch (error) {
    return `Could not install the watcher task (Windows only): ${String(error)}`
  }
}

// The mod's mutable state, kept in one object so the polling functions can sit at the top level of the file.
type Ctx = {
  statusFile: string
  sleepAfterMs: number
  // The last known play status, kept beside $.state so a state reset (/clear)
  // never flashes the sleep frames while music plays.
  known: NowPlaying
  lastPlayedAt: number
  // /clear keeps the old turn count, so the turn count alone cannot say a
  // conversation is going: `cleared` holds from a /clear to the next turn.
  cleared: boolean
  conversing: boolean
  timers: Timer[]
  // A resume swaps the session without a session.start and can end the old
  // session's timers, so each poll stamps this and `ensurePolling` restarts
  // the timers from whichever hook runs next once the stamp goes stale.
  lastPollAt: number
}

async function poll($: EngineInterface, ctx: Ctx) {
  try {
    const now = await $.clock.now()
    ctx.lastPollAt = now
    let parsed = SILENT

    try {
      parsed = parseStatus(await $.fs.read(ctx.statusFile), now)
    } catch {
      // missing or unreadable: silent
    }

    if (parsed.isPlaying) {
      ctx.lastPlayedAt = now
      ctx.known = parsed
    } else if (now - ctx.lastPlayedAt >= ctx.sleepAfterMs) {
      ctx.known = SILENT
    }

    const stored = await read($, nowPlaying)

    if (stored.isPlaying !== ctx.known.isPlaying || stored.track !== ctx.known.track) {
      const status = ctx.known
      await update($, nowPlaying, () => status)
    }

    // Only ever wakes Clawd: a reload loses `conversing`, and the turn
    // count can read 0 outside a turn, so neither may put him to sleep.
    // Only a /clear (session.end) does that.
    const isGoing = ctx.conversing || (!ctx.cleared && (await $.session.turns()) > 0)

    if (isGoing && !(await read($, inConversation))) {
      await update($, inConversation, () => true)
    }
  } catch {
    // the next poll tries again
  }
}

async function startPolling($: EngineInterface, ctx: Ctx) {
  for (const timer of ctx.timers) {
    timer.cancel()
  }

  ctx.timers = [
    $.clock.every(POLL_MS, () => void poll($, ctx)),
    $.clock.every(FRAME_MS, () => void update($, frame, n => n + 1).catch(() => {})),
  ]
  await poll($, ctx)
}

async function ensurePolling($: EngineInterface, ctx: Ctx) {
  try {
    if ((await $.clock.now()) - ctx.lastPollAt > POLL_MS * 3) {
      await startPolling($, ctx)
    }
  } catch {
    // the next hook tries again
  }
}

export const register: Register = (on, options) => {
  const ctx: Ctx = {
    statusFile: typeof options.statusFile === 'string' ? options.statusFile : '',
    sleepAfterMs:
      typeof options.sleepAfterSeconds === 'number' && options.sleepAfterSeconds >= 0
        ? options.sleepAfterSeconds * 1000
        : SLEEP_AFTER_MS,
    known: SILENT,
    lastPlayedAt: -Infinity,
    cleared: false,
    conversing: false,
    timers: [],
    lastPollAt: 0,
  }
  const { statusFile } = ctx

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clawd-setup',
      description: 'Install the Spotify watcher as a Windows scheduled task that starts at logon',
    })

    if (options.autostart === true) {
      void installWatcher($, statusFile, false).then(text => $.ui.log(`clawd-vibe: ${text}`, { to: 'debug' }))
    }

    ctx.cleared = false
    await startPolling($, ctx)

    return next(e)
  })

  on('command.run', { command: 'clawd-setup' }, async $ => ({
    text: await installWatcher($, statusFile, true),
  }))

  on('turn.start', async ($, e, next) => {
    ctx.cleared = false
    ctx.conversing = true
    await update($, inConversation, () => true)
    await ensurePolling($, ctx)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      ctx.cleared = true
      ctx.conversing = false
      await update($, inConversation, () => false)
    } else if (e.reason === 'resume') {
      // A resume loads a conversation that already has turns: lift the /clear
      // hold so the next poll, which counts them, wakes Clawd.
      ctx.cleared = false
      await ensurePolling($, ctx)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.isWorking || e.props.hasSurvey) {
      return next(e)
    }

    void ensurePolling($, ctx)

    const { Box, Text } = $.ui.resolve(e)
    const tick = await read($, frame)
    const stored = await read($, nowPlaying)
    const playing = stored.isPlaying ? stored : ctx.known
    const isAwake = await read($, inConversation)
    const band = await next(e)

    if (playing.isPlaying) {
      const { notes, eq, body } = FRAMES[tick % FRAMES.length]!
      const row = (text: string) => (
        <Box>
          {runs(text).map(run => (
            <Text color={run.isHeadset ? 'inactive' : 'claude'}>{run.text}</Text>
          ))}
        </Box>
      )

      return (
        <Box flexDirection="column">
          <Text color="suggestion">{notes}</Text>
          {row(body[0]!)}
          {row(body[1]!)}
          <Box>
            {row(body[2]!)}
            <Text color="success"> {eq}</Text>
            <Text dimColor wrap="truncate-end">
              {' '}
              vibing to {playing.track || 'Spotify'}
            </Text>
          </Box>
          {row(body[3]!)}
          {band}
        </Box>
      )
    }

    if (isAwake) {
      const rows = IDLE_FRAMES[Math.floor(tick / IDLE_TICKS) % IDLE_FRAMES.length]!

      return (
        <Box flexDirection="column">
          <Text color="claude">{rows[0]}</Text>
          <Box>
            <Text color="claude">{rows[1]}</Text>
            <Text dimColor wrap="truncate-end">
              {' '}
              awake, waiting for you…
            </Text>
          </Box>
          <Text color="claude">{rows[2]}</Text>
          {band}
        </Box>
      )
    }

    const { zs, body } = SLEEP_FRAMES[Math.floor(tick / SLEEP_TICKS) % SLEEP_FRAMES.length]!

    return (
      <Box flexDirection="column">
        <Text color="inactive">{zs[0]}</Text>
        <Text color="inactive">{zs[1]}</Text>
        <Text color="claude" dimColor>
          {body[0]}
        </Text>
        <Box>
          <Text color="claude" dimColor>
            {body[1]}
          </Text>
          <Text dimColor wrap="truncate-end">
            {' '}
            sleeping…
          </Text>
        </Box>
        <Text color="claude" dimColor>
          {body[2]}
        </Text>
        {band}
      </Box>
    )
  })
}
