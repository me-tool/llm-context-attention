import { createEngine, type Engine } from '@lang-context/core'
import type {
  ChatProvider,
  JudgeProvider,
  EmbeddingProvider,
  ChatMessage,
  JudgeContext,
  JudgeResult,
} from '@lang-context/core'
import { createDatabase, SqliteStore, SqliteVectorSearch, SqliteKeywordSearch } from '@lang-context/store-sqlite'

// --- Embedding dimensions ---
const EMBEDDING_DIMENSIONS = 384

// --- Local Embedding (simple hash-based, no API needed) ---
// Deterministic: same text always produces same embedding
// Good enough for topic clustering in demo/testing scenarios
class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS

  async embed(text: string): Promise<number[]> {
    const embedding = new Array(this.dimensions).fill(0)
    const normalized = text.toLowerCase().trim()

    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i)
      // Distribute character influence across embedding dimensions
      const idx = (charCode * 31 + i * 7) % this.dimensions
      embedding[idx] += (charCode - 96) / 26
      // Add bigram influence for better semantic spread
      if (i < normalized.length - 1) {
        const nextCode = normalized.charCodeAt(i + 1)
        const bigramIdx = (charCode * nextCode + i * 13) % this.dimensions
        embedding[bigramIdx] += 0.5
      }
    }

    // L2 normalize
    const norm = Math.sqrt(embedding.reduce((sum: number, v: number) => sum + v * v, 0)) || 1
    return embedding.map((v: number) => v / norm)
  }
}

// --- Local Judge (keyword-matching heuristic, no API needed) ---
class LocalJudgeProvider implements JudgeProvider {
  async judge(context: JudgeContext): Promise<JudgeResult> {
    if (context.candidates.length === 0) {
      return { targetId: null, reasoning: 'No candidates available', isNew: true, suggestedLinks: [] }
    }

    // Use fused score from retrieval as primary signal
    const best = context.candidates[0]

    // Stem-based matching: strip punctuation, take first 4 chars for fuzzy match
    const clean = (w: string) => w.replace(/[^a-z0-9]/g, '')
    const stem = (w: string) => clean(w).slice(0, 4)
    const userStems = new Set(
      context.userMessage.toLowerCase().split(/\s+/).map(stem).filter(s => s.length > 2)
    )

    let bestId = context.candidates[0].id
    let bestOverlap = 0
    let bestSummary = context.candidates[0].summary

    for (const c of context.candidates) {
      const cStems = new Set(
        c.summary.toLowerCase().split(/\s+/).map(stem).filter(s => s.length > 2)
      )
      const overlap = [...userStems].filter(s => cStems.has(s)).length
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestId = c.id
        bestSummary = c.summary
      }
    }

    if (bestOverlap > 0) {
      // Find potential links (other candidates with some relevance)
      const suggestedLinks = context.candidates
        .filter(c => c.id !== bestId)
        .filter(c => {
          const cStems = new Set(c.summary.toLowerCase().split(/\s+/).map(stem).filter(s => s.length > 2))
          return [...userStems].some(s => cStems.has(s))
        })
        .map(c => c.id)

      return {
        targetId: bestId,
        reasoning: `Matched topic "${bestSummary}" (${bestOverlap} stem overlaps)`,
        isNew: false,
        suggestedLinks,
      }
    }

    return {
      targetId: null,
      reasoning: `No stem overlap with any candidate`,
      isNew: true,
      suggestedLinks: [],
    }
  }
}

// --- Local Chat (echo-based, no API needed) ---
class LocalChatProvider implements ChatProvider {
  async chat(messages: ChatMessage[]): Promise<string> {
    const lastMsg = messages[messages.length - 1]
    // For summary generation, return a simplified version
    if (lastMsg?.content.includes('Summarize the main topic')) {
      const messagesSection = lastMsg.content.split('## Recent Messages')[1] || ''
      const firstUserMsg = messagesSection.match(/\[user\]: (.+)/)?.[1] || 'General discussion'
      return firstUserMsg.slice(0, 50)
    }
    return `[Response to: ${lastMsg?.content?.slice(0, 100)}]`
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    const content = lastUserMsg?.content || 'your message'

    const response = `I received your message about "${content.slice(0, 60)}". This is a local demo response — the context routing engine is working with real SQLite storage and topic classification. Connect an LLM API for full responses.`

    const words = response.split(' ')
    for (const word of words) {
      yield word + ' '
      await new Promise(r => setTimeout(r, 30))
    }
  }
}

// --- Try to use AI SDK providers if API key is available ---
function createProviders() {
  const useRealLLM = !!process.env.OPENAI_API_KEY

  if (useRealLLM) {
    // Dynamic import to avoid build errors when packages aren't configured
    try {
      const { AiSdkChatProvider, AiSdkJudgeProvider, AiSdkEmbeddingProvider } = require('@lang-context/provider-ai-sdk')
      const { openai } = require('@ai-sdk/openai')

      return {
        chat: new AiSdkChatProvider(openai('gpt-4o-mini')) as ChatProvider,
        judge: new AiSdkJudgeProvider({ model: openai('gpt-4o-mini') }) as JudgeProvider,
        embedding: new AiSdkEmbeddingProvider({
          model: openai.embedding('text-embedding-3-small'),
          dimensions: 1536,
        }) as EmbeddingProvider,
        embeddingDimensions: 1536,
      }
    } catch {
      console.warn('Failed to initialize AI SDK providers, falling back to local providers')
    }
  }

  return {
    chat: new LocalChatProvider(),
    judge: new LocalJudgeProvider(),
    embedding: new LocalEmbeddingProvider(),
    embeddingDimensions: EMBEDDING_DIMENSIONS,
  }
}

// --- Engine Singleton ---

let engine: Engine | null = null

export const linkSuggestionQueue: Array<{
  sourceId: string
  targetId: string
  sourceSummary: string
  targetSummary: string
}> = []

export function getEngine(): Engine {
  if (!engine) {
    const providers = createProviders()
    console.log('[engine] Initializing database...')
    let db: ReturnType<typeof createDatabase>
    try {
      db = createDatabase(':memory:')
      console.log('[engine] Database created OK')
    } catch (e) {
      console.error('[engine] Database creation failed:', e)
      throw e
    }

    let store: SqliteStore
    try {
      store = new SqliteStore(db)
      console.log('[engine] Store created OK')
    } catch (e) {
      console.error('[engine] Store creation failed:', e)
      throw e
    }

    let keywordSearch: SqliteKeywordSearch
    try {
      keywordSearch = new SqliteKeywordSearch(db)
      console.log('[engine] KeywordSearch created OK')
    } catch (e) {
      console.error('[engine] KeywordSearch creation failed:', e)
      throw e
    }

    // sqlite-vec may fail to load in some environments
    let vectorSearch: import('@lang-context/core').VectorSearchProvider
    try {
      vectorSearch = new SqliteVectorSearch(db, providers.embeddingDimensions)
    } catch (e) {
      console.warn('sqlite-vec not available, using no-op vector search:', (e as Error).message)
      // Fallback: no-op vector search (keyword search still works)
      vectorSearch = {
        async upsert() {},
        async search() { return [] },
        async delete() {},
      }
    }

    engine = createEngine({
      store,
      vectorSearch,
      keywordSearch,
      chat: providers.chat,
      judge: providers.judge,
      embedding: providers.embedding,
      onLinkSuggestion: (suggestion) => {
        linkSuggestionQueue.push(suggestion)
      },
    })
  }
  return engine
}
