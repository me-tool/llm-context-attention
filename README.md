# Lang Context Attention

A topic-aware context routing system for LLM conversations. Automatically clusters user messages by topic ("root questions") using hybrid retrieval (vector + BM25 + RRF fusion) and LLM judgment, then assembles only relevant context for each request.

This solves the problem of attention dilution in multi-topic conversations — instead of stuffing the entire chat history into the context window, only the messages relevant to the current topic are included.

## How It Works

```
User Message
    |
    v
[Embed] → [Vector Search + Keyword Search] → [RRF Score Fusion]
    |
    v
[LLM Judge: existing topic or new topic?]
    |
    v
[Assemble only relevant context] → [LLM Response]
```

1. User sends a message
2. The engine embeds it and searches existing topics via hybrid retrieval (vector similarity + BM25 keyword match)
3. Scores are fused using Reciprocal Rank Fusion (RRF)
4. An LLM judge classifies: does this belong to an existing topic, or is it a new one?
5. Only the relevant topic's conversation history is assembled into context
6. The response is streamed back and stored under the correct topic

## Project Structure

```
packages/
  core/              # Engine SDK — routing, context assembly, interfaces
  store-sqlite/      # Default storage — SQLite + sqlite-vec + FTS5
  provider-ai-sdk/   # Default LLM — Vercel AI SDK + AI Gateway
apps/
  demo/              # Next.js demo app with full UI
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Run demo (no API key needed — uses local providers)
cd apps/demo
pnpm dev
```

Open http://localhost:3000. The demo runs with:
- **Real SQLite storage** (persisted to `demo.db`)
- **Local embedding** (deterministic hash-based, no API needed)
- **Local topic classifier** (stem-based keyword matching)
- **Local chat** (echo responses)

### With OpenAI (full experience)

```bash
# In apps/demo/.env.local
OPENAI_API_KEY=sk-xxx
```

This automatically upgrades to:
- `gpt-4o-mini` for chat and topic classification
- `text-embedding-3-small` for embeddings

## Architecture

### Pluggable Providers

Every component is replaceable via interfaces:

```typescript
import { createEngine } from '@lang-context/core'

const engine = createEngine({
  store: yourStoreProvider,        // StoreProvider
  vectorSearch: yourVectorSearch,  // VectorSearchProvider
  keywordSearch: yourKeywordSearch, // KeywordSearchProvider
  chat: yourChatProvider,          // ChatProvider
  judge: yourJudgeProvider,        // JudgeProvider
  embedding: yourEmbeddingProvider, // EmbeddingProvider
})
```

### Engine API

```typescript
// Create a session
const session = await engine.createSession('You are helpful.', 'My Session')

// Send a message — automatically routes to the right topic
const { stream, routingDecision, rootQuestionId } = await engine.processMessage(
  session.id,
  'How do I deploy to AWS?'
)

// Consume streaming response
for await (const chunk of stream) {
  process.stdout.write(chunk)
}

// Query data
const topics = await engine.getRootQuestions(session.id)
const messages = await engine.getMessages(rootQuestionId)
const timeline = await engine.getTimeline(session.id)
const routing = await engine.getRoutingDecision(messageId)

// Manual operations
await engine.reassignMessage(messageId, newTopicId)
await engine.linkQuestions(topicAId, topicBId)
```

### Demo App UI

- **Three-panel layout**: Topic tree | Chat area | Debug panel
- **Topic tree sidebar** (Cmd+B): See all topics, click to filter
- **Debug panel** (Cmd+D): Inspect routing decisions, scores, timing
- **Right-click reassign**: Move a message to a different topic
- **Link suggestions**: Banner prompts when topics may be related

## Testing

```bash
# Run all tests (43 tests)
pnpm test

# Run specific package
pnpm --filter @lang-context/core test
pnpm --filter @lang-context/store-sqlite test
pnpm --filter @lang-context/provider-ai-sdk test
```

Integration tests cover:
- Cold start (first message creates new topic)
- Follow-up routing (same topic messages cluster together)
- New topic creation (unrelated messages split off)
- 5-round interleaved conversation across 2 topics
- Message reassignment and topic linking
- Error handling (empty messages, invalid sessions)

## Configuration

```typescript
createEngine({
  // ... providers ...
  topK: 5,                    // Retrieval candidates
  minFusedScoreForJudge: 0.01, // RRF score threshold
  rrfK: 60,                   // RRF constant
  maxContextTokens: 4000,     // Token budget
  summaryUpdateInterval: 5,   // Re-summarize every N messages
  summaryContextSize: 10,     // Messages for summary generation
})
```

## Roadmap

- [x] v1a: Core engine + SQLite storage + demo app
- [ ] v1b: Cmd+K quick panel, drag-to-reassign, session management
- [ ] v2: Auto cross-topic linking, degradation strategies, PostgreSQL adapter

## License

MIT
