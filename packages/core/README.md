# @lang-context/core

Core engine for **Lang Context Attention** — a topic-aware context routing system for LLM conversations.

<p>
  <a href="https://github.com/me-tool/lang-context-attention"><img src="https://img.shields.io/badge/GitHub-lang--context--attention-6366f1?style=flat-square&logo=github" alt="GitHub"/></a>
  <img src="https://img.shields.io/badge/tests-18%20passing-10b981?style=flat-square" alt="tests"/>
  <img src="https://img.shields.io/badge/license-MIT-e2e8f0?style=flat-square" alt="license"/>
</p>

## What It Does

In multi-turn LLM conversations, users jump between topics. This engine automatically:

1. **Clusters messages by topic** using hybrid retrieval (vector + BM25 + RRF fusion)
2. **Routes each message** to the correct topic via LLM judgment
3. **Assembles only relevant context** with token budget management
4. **Streams responses** back with full routing observability

The result: focused LLM responses with ~50% token savings.

## Install

```bash
pnpm add @lang-context/core
```

## Quick Start

```typescript
import { createEngine } from '@lang-context/core'

const engine = createEngine({
  store: yourStoreProvider,          // Where to persist data
  vectorSearch: yourVectorSearch,    // Semantic similarity search
  keywordSearch: yourKeywordSearch,  // BM25 keyword search
  chat: yourChatProvider,            // LLM for responses
  judge: yourJudgeProvider,          // LLM for topic classification
  embedding: yourEmbeddingProvider,  // Text → vector embedding
})

// Create a session
const session = await engine.createSession('You are a helpful assistant.')

// Send messages — routing happens automatically
const { stream, routingDecision, rootQuestionId } =
  await engine.processMessage(session.id, 'How do I deploy to AWS?')

for await (const chunk of stream) {
  process.stdout.write(chunk)
}

// The next message is automatically routed to the right topic
const r2 = await engine.processMessage(session.id, 'What about using Docker on AWS?')
// → routed to same topic as above

const r3 = await engine.processMessage(session.id, 'Best chocolate cake recipe?')
// → creates a new topic (unrelated to AWS)
```

## Default Implementations

Use these companion packages for zero-config setup:

| Package | Description |
|---------|-------------|
| [`@lang-context/store-sqlite`](https://www.npmjs.com/package/@lang-context/store-sqlite) | SQLite storage + sqlite-vec vector search + FTS5 keyword search |
| [`@lang-context/provider-ai-sdk`](https://www.npmjs.com/package/@lang-context/provider-ai-sdk) | Vercel AI SDK providers (OpenAI, Anthropic, etc.) |

```typescript
import { createEngine } from '@lang-context/core'
import { createDatabase, SqliteStore, SqliteVectorSearch, SqliteKeywordSearch } from '@lang-context/store-sqlite'
import { AiSdkChatProvider, AiSdkJudgeProvider, AiSdkEmbeddingProvider } from '@lang-context/provider-ai-sdk'
import { openai } from '@ai-sdk/openai'

const db = createDatabase('./conversations.db')

const engine = createEngine({
  store: new SqliteStore(db),
  vectorSearch: new SqliteVectorSearch(db, 1536),
  keywordSearch: new SqliteKeywordSearch(db),
  chat: new AiSdkChatProvider(openai('gpt-4o-mini')),
  judge: new AiSdkJudgeProvider({ model: openai('gpt-4o-mini') }),
  embedding: new AiSdkEmbeddingProvider({
    model: openai.embedding('text-embedding-3-small'),
    dimensions: 1536,
  }),
})
```

## Engine API

### Session Management

```typescript
engine.createSession(systemPrompt: string, title?: string): Promise<Session>
engine.getSession(sessionId: string): Promise<Session | null>
```

### Message Processing

```typescript
// Core method — handles the full routing pipeline
engine.processMessage(sessionId: string, userMessage: string): Promise<{
  stream: AsyncIterable<string>     // Streaming LLM response
  routingDecision: RoutingDecision  // Full routing metadata
  rootQuestionId: string            // Which topic this was routed to
}>
```

### Query Methods

```typescript
engine.getRootQuestions(sessionId): Promise<RootQuestion[]>  // All topics
engine.getMessages(rootQuestionId): Promise<Message[]>       // Messages in a topic
engine.getTimeline(sessionId): Promise<Message[]>            // All messages chronologically
engine.getRoutingDecision(messageId): Promise<RoutingDecision | null>
```

### Manual Operations

```typescript
engine.reassignMessage(messageId, newTopicId): Promise<void>      // Fix routing errors
engine.linkQuestions(topicA, topicB): Promise<QuestionLink>        // Link related topics
engine.unlinkQuestions(linkId): Promise<void>
```

## Configuration

```typescript
createEngine({
  // ... providers (required) ...

  topK: 5,                      // Candidates per retrieval (default: 5)
  rrfK: 60,                     // RRF fusion constant (default: 60)
  minFusedScoreForJudge: 0.01,  // Score threshold for judge (default: 0.01)
  maxContextTokens: 4000,       // Token budget for context (default: 4000)
  summaryUpdateInterval: 5,     // Re-summarize every N messages (default: 5)
  summaryContextSize: 10,       // Messages for summary prompt (default: 10)

  // Callbacks
  onRoutingComplete: (decision) => { /* routing telemetry */ },
  onLinkSuggestion: (suggestion) => { /* UI notification */ },
})
```

## Provider Interfaces

Implement these to use your own storage, search, or LLM:

```typescript
interface StoreProvider { /* Session, RootQuestion, Message, RoutingDecision, QuestionLink CRUD */ }
interface VectorSearchProvider { upsert, search, delete }
interface KeywordSearchProvider { upsert, search, delete }
interface ChatProvider { chat, streamChat }
interface JudgeProvider { judge }
interface EmbeddingProvider { embed, dimensions }
```

Full interface definitions: [interfaces.ts](https://github.com/me-tool/lang-context-attention/blob/main/packages/core/src/interfaces.ts)

## Routing Flow

```
User Message → Embed → [Vector Search ∥ Keyword Search] → RRF Fusion → LLM Judge → Context Assembly → Stream Response
```

See the [design spec](https://github.com/me-tool/lang-context-attention/blob/main/docs/superpowers/specs/2026-03-16-lang-context-attention-design.md) for full architecture details.

## License

MIT
