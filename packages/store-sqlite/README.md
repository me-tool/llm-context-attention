# @lang-context/store-sqlite

SQLite storage provider for **Lang Context Attention** — provides persistence, vector search, and keyword search out of the box.

<p>
  <a href="https://github.com/me-tool/lang-context-attention"><img src="https://img.shields.io/badge/GitHub-lang--context--attention-6366f1?style=flat-square&logo=github" alt="GitHub"/></a>
  <img src="https://img.shields.io/badge/tests-22%20passing-10b981?style=flat-square" alt="tests"/>
  <img src="https://img.shields.io/badge/license-MIT-e2e8f0?style=flat-square" alt="license"/>
</p>

## What's Included

| Component | Technology | Interface |
|-----------|-----------|-----------|
| `SqliteStore` | better-sqlite3 | `StoreProvider` — full CRUD for sessions, topics, messages, routing decisions, links |
| `SqliteVectorSearch` | sqlite-vec | `VectorSearchProvider` — cosine similarity search on embeddings |
| `SqliteKeywordSearch` | SQLite FTS5 | `KeywordSearchProvider` — BM25 full-text keyword search |
| `createDatabase` | better-sqlite3 | Database factory with auto-migration (WAL mode, foreign keys, indexes) |

## Install

```bash
pnpm add @lang-context/core @lang-context/store-sqlite
```

## Quick Start

```typescript
import { createEngine } from '@lang-context/core'
import { createDatabase, SqliteStore, SqliteVectorSearch, SqliteKeywordSearch } from '@lang-context/store-sqlite'

// Create database (file-based or in-memory)
const db = createDatabase('./conversations.db')  // persistent
// const db = createDatabase(':memory:')          // ephemeral

// Use with the engine
const engine = createEngine({
  store: new SqliteStore(db),
  vectorSearch: new SqliteVectorSearch(db, 1536),   // 1536 = embedding dimensions
  keywordSearch: new SqliteKeywordSearch(db),
  chat: yourChatProvider,
  judge: yourJudgeProvider,
  embedding: yourEmbeddingProvider,
})
```

## Components

### `createDatabase(path?)`

Creates and initializes a SQLite database with all required tables and indexes.

```typescript
import { createDatabase } from '@lang-context/store-sqlite'

const db = createDatabase('./data.db')
```

**Tables created:**
- `sessions` — id, title, system_prompt, timestamps
- `root_questions` — id, session_id, summary, message_count, timestamps
- `messages` — id, session_id, root_question_id, role, content, timestamp
- `routing_decisions` — id, message_id, candidates (JSON), judgment (JSON), timing (JSON)
- `question_links` — id, source_id, target_id, created_by

**Features:** WAL journal mode, foreign keys enabled, optimized indexes.

### `SqliteStore`

Full `StoreProvider` implementation with 15 methods covering all CRUD operations.

```typescript
import { SqliteStore } from '@lang-context/store-sqlite'

const store = new SqliteStore(db)

// Session operations
await store.createSession(session)
await store.getSession(id)
await store.updateSession(id, { title: 'New Title' })

// Topic operations
await store.createRootQuestion(rootQuestion)
await store.getRootQuestionsBySession(sessionId)

// Message operations
await store.createMessage(message)
await store.getMessagesByRootQuestion(rootQuestionId)
await store.getMessagesBySession(sessionId)        // timeline
await store.reassignMessage(messageId, newTopicId) // fix routing errors

// Routing decision operations
await store.createRoutingDecision(decision)
await store.getRoutingDecisionByMessage(messageId)

// Link operations
await store.createLink(link)
await store.getLinksByRootQuestion(rootQuestionId)  // bidirectional query
await store.deleteLink(linkId)
```

### `SqliteVectorSearch`

Vector similarity search powered by [sqlite-vec](https://github.com/asg017/sqlite-vec).

```typescript
import { SqliteVectorSearch } from '@lang-context/store-sqlite'

const vectorSearch = new SqliteVectorSearch(db, 1536)  // dimensions must match your embedding model

await vectorSearch.upsert('topic-id', 'topic summary text', embeddingVector)
const results = await vectorSearch.search(queryEmbedding, 5)  // top-5 similar
await vectorSearch.delete('topic-id')
```

- **Upsert semantics**: idempotent by rootQuestionId
- **Score**: `1 / (1 + L2_distance)` — range (0, 1], higher = more similar

### `SqliteKeywordSearch`

BM25 keyword search powered by SQLite FTS5.

```typescript
import { SqliteKeywordSearch } from '@lang-context/store-sqlite'

const keywordSearch = new SqliteKeywordSearch(db)

await keywordSearch.upsert('topic-id', 'AWS deployment Docker containers')
const results = await keywordSearch.search('deploy AWS', 5)
await keywordSearch.delete('topic-id')
```

- **FTS5 safe**: query tokens are automatically escaped (handles special characters like `*`, `"`, `OR`)
- **Score**: negated FTS5 rank (higher = more relevant)

## Deployment Notes

- Requires **persistent filesystem** — not compatible with serverless (Vercel, AWS Lambda)
- Use local Node.js server or Docker deployment
- `sqlite-vec` is a native extension — needs compilation on the target platform
- For serverless, consider building a custom adapter with Turso or PostgreSQL + pgvector

## License

MIT
