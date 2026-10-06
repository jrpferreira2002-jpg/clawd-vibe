export type NowPlaying = { isPlaying: boolean; track: string }
export type Reaction = 'celebrating' | 'dizzy' | 'startled'

declare module 'claude-code' {
  interface PluginState {
    'clawd-vibe': {
      nowPlaying: NowPlaying
      frame: number
      inConversation: boolean
      reaction: Reaction | null
      listening: boolean
      bored: boolean
    }
  }
}
