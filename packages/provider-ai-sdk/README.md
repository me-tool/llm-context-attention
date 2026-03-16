# @lang-context/provider-ai-sdk

[Vercel AI SDK](https://sdk.vercel.ai/) providers for **Lang Context Attention** — connects the routing engine to OpenAI, Anthropic, Google, and 20+ LLM providers.

<p>
  <a href="https://github.com/me-tool/lang-context-attention"><img src="https://img.shields.io/badge/GitHub-lang--context--attention-6366f1?style=flat-square&logo=github" alt="GitHub"/></a>
  <img src="https://img.shields.io/badge/tests-3%20passing-10b981?style=flat-square" alt="tests"/>
  <img src="https://img.shields.io/badge/license-MIT-e2e8f0?style=flat-square" alt="license"/>
</p>

## What's Included

| Provider | Interface | Vercel AI SDK API |
|----------|-----------|-------------------|
| `AiSdkChatProvider` | `ChatProvider` | `generateText` / `streamText` |
| `AiSdkJudgeProvider` | `JudgeProvider` | `generateObject` + zod schema (guaranteed JSON) |
| `AiSdkEmbeddingProvider` | `EmbeddingProvider` | `embed` |

## Install

```bash
pnpm add @lang-context/core @lang-context/provider-ai-sdk ai @ai-sdk/openai
```

Replace `@ai-sdk/openai` with your preferred provider:
- `@ai-sdk/anthropic` — Claude
- `@ai-sdk/google` — Gemini
- `@ai-sdk/mistral` — Mistral
- See [Vercel AI SDK providers](https://sdk.vercel.ai/providers) for the full list

## Quick Start

```typescript
import { createEngine } from '@lang-context/core'
import { AiSdkChatProvider, AiSdkJudgeProvider, AiSdkEmbeddingProvider } from '@lang-context/provider-ai-sdk'
import { openai } from '@ai-sdk/openai'

const engine = createEngine({
  store: yourStore,
  vectorSearch: yourVectorSearch,
  keywordSearch: yourKeywordSearch,

  // Use different models for different tasks
  chat: new AiSdkChatProvider(openai('gpt-4o')),           // powerful model for responses
  judge: new AiSdkJudgeProvider({ model: openai('gpt-4o-mini') }),  // fast model for classification
  embedding: new AiSdkEmbeddingProvider({
    model: openai.embedding('text-embedding-3-small'),
    dimensions: 1536,
  }),
})
```

## Providers

### `AiSdkChatProvider`

Handles main conversation and summary generation.

```typescript
import { AiSdkChatProvider } from '@lang-context/provider-ai-sdk'
import { openai } from '@ai-sdk/openai'

const chat = new AiSdkChatProvider(openai('gpt-4o'))

// Non-streaming
const response = await chat.chat([
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' },
])

// Streaming
for await (const chunk of chat.streamChat(messages)) {
  process.stdout.write(chunk)
}
```

### `AiSdkJudgeProvider`

Classifies messages into topics using structured JSON output (guaranteed by zod schema).

```typescript
import { AiSdkJudgeProvider } from '@lang-context/provider-ai-sdk'
import { openai } from '@ai-sdk/openai'

const judge = new AiSdkJudgeProvider({
  model: openai('gpt-4o-mini'),        // fast model recommended
  promptTemplate: customTemplate,       // optional: override default prompt
})

const result = await judge.judge({
  userMessage: 'How to configure AWS load balancer?',
  candidates: [
    { id: 'topic-1', summary: 'AWS deployment guide', fusedScore: 0.033 },
    { id: 'topic-2', summary: 'Chocolate cake recipe', fusedScore: 0.015 },
  ],
})
// → { targetId: 'topic-1', isNew: false, reasoning: '...', suggestedLinks: [] }
```

**Output schema (enforced by zod):**
```typescript
{
  targetId: string | null    // null = new topic
  isNew: boolean
  reasoning: string
  suggestedLinks: string[]   // related but different topics
}
```

**Custom prompt template:**
```typescript
const judge = new AiSdkJudgeProvider({
  model: openai('gpt-4o-mini'),
  promptTemplate: `Your custom classification prompt here.
    Available variables: {{topics}} and {{userMessage}}`,
})
```

### `AiSdkEmbeddingProvider`

Generates vector embeddings for semantic similarity search.

```typescript
import { AiSdkEmbeddingProvider } from '@lang-context/provider-ai-sdk'
import { openai } from '@ai-sdk/openai'

const embedding = new AiSdkEmbeddingProvider({
  model: openai.embedding('text-embedding-3-small'),
  dimensions: 1536,
})

const vector = await embedding.embed('How to deploy to AWS?')
// → number[1536]

console.log(embedding.dimensions)  // 1536
```

## Using with Other LLM Providers

```typescript
// Anthropic Claude
import { anthropic } from '@ai-sdk/anthropic'
const chat = new AiSdkChatProvider(anthropic('claude-sonnet-4-20250514'))

// Google Gemini
import { google } from '@ai-sdk/google'
const chat = new AiSdkChatProvider(google('gemini-2.0-flash'))

// Mix and match — use fast models for judge, powerful for chat
const engine = createEngine({
  chat: new AiSdkChatProvider(anthropic('claude-sonnet-4-20250514')),
  judge: new AiSdkJudgeProvider({ model: openai('gpt-4o-mini') }),
  embedding: new AiSdkEmbeddingProvider({
    model: openai.embedding('text-embedding-3-small'),
    dimensions: 1536,
  }),
  // ...
})
```

## Environment Variables

Set these in your `.env` or `.env.local`:

```bash
# OpenAI
OPENAI_API_KEY=sk-xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Or use AI Gateway for unified routing
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/xxx
```

## License

MIT
