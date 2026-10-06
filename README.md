# clawd-vibe

A [Claude Code](https://claude.com/claude-code) mod that puts Clawd above your prompt.

| Mood | When | What you see |
| --- | --- | --- |
| **Celebrating** | a turn just finished with an answer (for 5 s) | happy eyes, arms in the air, confetti and `all done!` |
| **Dizzy** | a turn just ended in an error or a refusal (for 5 s) | `x` eyes, swaying, stars circling his head |
| **Startled** | you just interrupted a turn (for 5 s) | wide eyes, a `!`, then he settles back down |
| **Vibing** | Spotify is playing | Clawd in a headset dancing, floating notes, an equaliser and `vibing to Artist - Track` |
| **Listening** | you are typing in the prompt (until 2 s after the last key) | Clawd leans in and reads along, with typing dots |
| **Bored** | a conversation is going but nothing has happened for a while (2 min by default) | taps his foot, glances around, yawns, `…still here` |
| **Awake** | no music, a conversation is going | Clawd stands there, blinks, glances around, waves and stretches |
| **Sleeping** | no music, no conversation yet (fresh session, or after `/clear`) | closed eyes, dim colours, drifting Zs and snore bubbles |

The moods are listed from strongest to weakest: a reaction to a finished turn shows even over the music, and typing
wakes a sleeping Clawd.

Clawd only shows while Claude is idle. The animation needs block characters, so use a terminal that draws them
properly (in VS Code's terminal keep `terminal.integrated.gpuAcceleration` on).

## Requirements

- Claude Code with function-hook mods (early access).
- **Windows + the Spotify desktop app** for the music mood. The watcher reads Spotify's window title, so it
  does not work with the web player. Without it the mod still works, it just never vibes.

## Install

In a Claude Code terminal session:

```
/plugin install clawd-vibe --marketplace jrpferreira2002-jpg/clawd-vibe
```

Answer `y` to add the marketplace, pick a scope, and the install screen asks for these options:

| Option | What it is |
| --- | --- |
| **Spotify status file** (required) | Full path of the JSON file the watcher writes and the mod reads, e.g. `C:\Users\you\AppData\Local\clawd-vibe\.clawd-spotify.json`. From WSL use `/mnt/c/Users/you/...`. |
| **Start the watcher at every Windows logon** | Creates a hidden scheduled task so you never start the watcher by hand. Off by default. |
| **Seconds of silence before Clawd stops vibing** | Default `2`. |
| **Seconds of quiet before Clawd gets bored** | Default `120`. `0` turns the bored mood off. |

Change them later from `/config`.

## The Spotify watcher

`scripts/clawd-spotify-watch.ps1` writes `{"isPlaying":true,"track":"Artist - Track","ts":<unix ms>}` to the status
file once a second. A status older than 15 s counts as silence, so Clawd goes to sleep if the watcher stops.

Pick one way to run it:

- **Automatically at logon:** turn on the autostart option, or run `/clawd-setup` in Claude Code at any time. Both
  copy the watcher to `%LOCALAPPDATA%\clawd-vibe\` and register a scheduled task named `Clawd Spotify Watch` that
  starts at every logon and runs now.
- **By hand:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\clawd-spotify-watch.ps1 -OutFile "C:\path\you\chose\.clawd-spotify.json"
  ```

Remove the task with:

```powershell
Unregister-ScheduledTask -TaskName 'Clawd Spotify Watch' -Confirm:$false
```

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT
