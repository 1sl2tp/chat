import { HEART_REACTION, nextHeartReaction } from './heart'

export interface ChatReaction {
  message_id: string
  profile_id: string
  emoji: string | null
  updated_at: string
}

export interface ChatReactionBackend {
  load(messageIds: string[]): Promise<ChatReaction[]>
  subscribe(onReaction: (reaction: ChatReaction) => void): () => void
  set(messageId: string, emoji: string | null): Promise<ChatReaction>
}

export interface HeartPresentation {
  count: number
  mine: boolean
}

export class ChatReactionSession {
  private readonly reactions = new Map<string, Map<string, ChatReaction>>()
  private activeMessageIds = new Set<string>()
  private currentProfileId = ''
  private signature = ''
  private disposeSubscription: (() => void) | null = null
  private onChange: (() => void) | null = null
  private syncGeneration = 0

  constructor(private readonly backend: ChatReactionBackend) {}

  start(onChange: () => void): void {
    this.disposeSubscription?.()
    this.onChange = onChange
    this.disposeSubscription = this.backend.subscribe((reaction) => {
      if (!this.activeMessageIds.has(reaction.message_id)) return
      this.upsert(reaction)
      this.onChange?.()
    })
  }

  async sync(messageIds: string[], currentProfileId: string | null): Promise<void> {
    const uniqueIds = [...new Set(messageIds.filter(Boolean))]
    const nextSignature = `${currentProfileId ?? ''}|${uniqueIds.join(',')}`
    if (nextSignature === this.signature) return

    this.signature = nextSignature
    this.currentProfileId = currentProfileId ?? ''
    this.activeMessageIds = new Set(uniqueIds)
    const generation = ++this.syncGeneration
    this.reactions.clear()

    if (uniqueIds.length === 0) {
      this.onChange?.()
      return
    }

    const loaded = await this.backend.load(uniqueIds)
    if (generation !== this.syncGeneration) return
    for (const reaction of loaded) {
      if (this.activeMessageIds.has(reaction.message_id)) this.upsert(reaction)
    }
    this.onChange?.()
  }

  getHeart(messageId: string): HeartPresentation {
    const rows = this.reactions.get(messageId)
    if (!rows) return { count: 0, mine: false }

    let count = 0
    let mine = false
    for (const reaction of rows.values()) {
      if (reaction.emoji !== HEART_REACTION) continue
      count += 1
      if (reaction.profile_id === this.currentProfileId) mine = true
    }
    return { count, mine }
  }

  async toggleHeart(messageId: string): Promise<void> {
    if (!this.currentProfileId || !this.activeMessageIds.has(messageId)) return
    const mine = this.reactions.get(messageId)?.get(this.currentProfileId)?.emoji ?? null
    const reaction = await this.backend.set(messageId, nextHeartReaction(mine))
    this.upsert(reaction)
    this.onChange?.()
  }

  dispose(): void {
    this.disposeSubscription?.()
    this.disposeSubscription = null
    this.onChange = null
    this.reactions.clear()
    this.activeMessageIds.clear()
    this.currentProfileId = ''
    this.signature = ''
    this.syncGeneration += 1
  }

  private upsert(reaction: ChatReaction): void {
    let rows = this.reactions.get(reaction.message_id)
    if (!rows) {
      rows = new Map<string, ChatReaction>()
      this.reactions.set(reaction.message_id, rows)
    }
    rows.set(reaction.profile_id, reaction)
  }
}
