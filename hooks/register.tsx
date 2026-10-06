import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { NowPlaying, Reaction } from '../types'
import {
  BORED_AFTER_MS,
  BORED_FRAMES,
  FRAME_MS,
  FRAMES,
  IDLE_FRAMES,
  IDLE_TICKS,
  LISTEN_FRAMES,
  LISTEN_MS,
  POLL_MS,
  REACTION_MS,
  REACTIONS,
  SILENT,
  SLEEP_AFTER_MS,
  TASK_NAME,
  SLEEP_FRAMES,
  SLEEP_TICKS,
  parseStatus,
  reactionFor,
  runs,
} from './clawd'
import type { Pose } from './clawd'

const nowPlaying = atom({ plugin: 'clawd-vibe', key: 'nowPlaying' } as const, SILENT)
const frame = atom({ plugin: 'clawd-vibe', key: 'frame' } as const, 0)
const inConversation = atom({ plugin: 'clawd-vibe', key: 'inConversation' } as const, false)
const reaction = atom({ plugin: 'clawd-vibe', key: 'reaction' } as const, null as Reaction | null)
const listening = atom({ plugin: 'clawd-vibe', key: 'listening' } as const, false)
const bored = atom({ plugin: 'clawd-vibe', key: 'bored' } as const, false)

// Each writes its flag only when it changes, so a poll redraws nothing it need not.
async function setListening($: EngineInterface, value: boolean) {
  if ((await read($, listening)) !== value) {
    await update($, listening, () => value)
  }
}

async function setBored($: EngineInterface, value: boolean) {
  if ((await read($, bored)) !== value) {
    await update($, bored, () => value)
  }
}

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
  boredAfterMs: number
  // How the last turn ended, shown until `reactionUntil`.
  reaction: Reaction | null
  reactionUntil: number
  // The last keystroke in the prompt, and the last thing anyone did.
  typedAt: number
  lastActiveAt: number
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

    if (ctx.reaction && now >= ctx.reactionUntil) {
      ctx.reaction = null
    }

    if ((await read($, reaction)) !== ctx.reaction) {
      const shown = ctx.reaction
      await update($, reaction, () => shown)
    }

    await setListening($, now - ctx.typedAt < LISTEN_MS)
    await setBored(
      $,
      (await read($, inConversation)) &&
        ctx.boredAfterMs > 0 && now - ctx.lastActiveAt >= ctx.boredAfterMs,
    )
  } catch {
    // the next poll tries again
  }
}

async function startPolling($: EngineInterface, ctx: Ctx) {
  if (!ctx.lastActiveAt) {
    ctx.lastActiveAt = await $.clock.now()
  }

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
    boredAfterMs:
      typeof options.boredAfterSeconds === 'number' && options.boredAfterSeconds >= 0
        ? options.boredAfterSeconds * 1000
        : BORED_AFTER_MS,
    reaction: null,
    reactionUntil: 0,
    typedAt: -Infinity,
    lastActiveAt: 0,
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
    ctx.reaction = null
    ctx.typedAt = -Infinity
    ctx.lastActiveAt = await $.clock.now()
    await update($, inConversation, () => true)
    await update($, reaction, () => null)
    await setListening($, false)
    await setBored($, false)
    await ensurePolling($, ctx)

    return next(e)
  })

  // A subagent's turns end inside the main one: only the main loop's count.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      const kind = reactionFor(e.reason)
      ctx.reaction = kind
      ctx.reactionUntil = now + REACTION_MS
      ctx.lastActiveAt = now
      await update($, reaction, () => kind)
      await setBored($, false)
    }

    return next(e)
  })

  // Every keystroke passes here, so this only notes the time and never waits.
  on('prompt.edit', ($, e, next) => {
    void (async () => {
      const now = await $.clock.now()
      ctx.typedAt = now
      ctx.lastActiveAt = now
      await setListening($, true)
      await setBored($, false)
    })().catch(() => {})

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      ctx.cleared = true
      ctx.conversing = false
      ctx.reaction = null
      await update($, inConversation, () => false)
      await update($, reaction, () => null)
      await setBored($, false)
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
    const reacting = await read($, reaction)
    const isListening = await read($, listening)
    const isBored = await read($, bored)
    const band = await next(e)

    // Letter eyes (x, o) sit on a filled cell so the head stays closed.
    const head = (row: string) =>
      row.split(/([xo])/).map(part =>
        part === 'x' || part === 'o' ? (
          <Text color="inverseText" backgroundColor="claude">
            {part}
          </Text>
        ) : (
          <Text color="claude">{part}</Text>
        ),
      )

    // Stars, confetti or dots above Clawd, then his three rows with a label beside the middle one.
    const posed = (pose: Pose, label: string, topColor: 'warning' | 'error' | 'suggestion' | 'inactive') => {
      const key = (i: number) => <Text color="suggestion">{pose.keys?.[i]}</Text>

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={topColor}>{pose.top}</Text>
            {key(0)}
          </Box>
          <Box>
            {head(pose.rows[0])}
            {key(1)}
          </Box>
          <Box>
            <Text color="claude">{pose.rows[1]}</Text>
            {key(2)}
            <Text dimColor wrap="truncate-end">
              {' '}
              {label}
            </Text>
          </Box>
          <Box>
            <Text color="claude">{pose.rows[2]}</Text>
            {key(3)}
          </Box>
          {band}
        </Box>
      )
    }

    if (reacting) {
      const { frames, ticks, label, color } = REACTIONS[reacting]

      return posed(frames[Math.floor(tick / ticks) % frames.length]!, label, color)
    }

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

    if (isListening) {
      return posed(LISTEN_FRAMES[tick % LISTEN_FRAMES.length]!, 'listening…', 'suggestion')
    }

    if (isAwake && isBored) {
      return posed(BORED_FRAMES[Math.floor(tick / IDLE_TICKS) % BORED_FRAMES.length]!, '…still here', 'inactive')
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
