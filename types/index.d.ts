export type NowPlaying = { isPlaying: boolean; track: string }

declare module 'claude-code' {
  interface PluginState {
    'clawd-vibe': {
      nowPlaying: NowPlaying
      frame: number
      inConversation: boolean
    }
  }
}
