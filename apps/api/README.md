## AI Crash Course API (Nest.js)

This service stores and serves chat threads. Each thread is a single aggregate that contains:
- thread metadata (agent, model, user/account ids)
- system prompt template and rendered system prompt
- parameters used to render the prompt
- token counters (input/output)
- messages array including system, user, assistant, and tool messages

It supports pluggable persistence:
- Postgres: threads stored in a table with JSONB columns
- MongoDB: threads stored as documents with embedded messages

### Prerequisites
- Node.js >= 18
- Docker (for local Postgres/Mongo)

### Environment
Copy `.env.example` to `.env` and set values:

```ini
# Choose data store
# PERSISTENCE=postgres
# POSTGRES_URL=postgres://postgres:postgres@localhost:5432/ai_crash_course
# or
# PERSISTENCE=mongo
# MONGO_URL=mongodb://localhost:27017/ai_crash_course

# LLM provider and model
LLM_PROVIDER=openai   # one of: openai | claude | gemini | grok
LLM_MODEL=gpt-5-mini

# Provider API keys (blank allowed)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=
```

### Local databases with Docker

Start Postgres and Mongo (and run Postgres migration):
```sh
npm run db:up
```
Stop containers:
```sh
npm run db:down
```

### Run the API
```sh
npm run start:dev
```
Swagger is served at `/api`.

### Endpoints
- `POST /threads` → create a new thread
  - Body: `{ agent: string, parameters?: object, model?: string, userMessage?: string }`
- `GET /threads/:id` → get the full thread
- `GET /threads?accountId=1` → list threads
- `DELETE /threads/:id` → delete thread
- `POST /threads/:id/chat` → append a user message, run tools/LLM, return last assistant message
  - Body: `{ message: string, metadata?: object }`

### Adding an agent

Agents live under `apps/api/agents/<agent-name>` and contain:
- `prompt.md` — system prompt (Handlebars helpers available: `eq`, `ne`, `json`)
- `tools.ts` — exports an array of LangChain tools created via `tool(handler, { name, description, schema })`

Steps:
1) Create a folder and prompt:
```text
apps/api/agents/your-agent/
  prompt.md
  tools.ts
```
2) Implement tools (example):
```ts
import { tool } from '@langchain/core/tools';

const exampleTool = tool(async (input: any) => ({ ok: true, input }), {
  name: 'example_tool',
  description: 'Describe what this tool does',
  schema: {
    type: 'object',
    properties: { foo: { type: 'string' } },
    required: ['foo'],
    additionalProperties: false,
  },
});

export default [exampleTool];
```

3) Create a thread with your agent:
```sh
curl -X POST http://localhost:3000/threads \
  -H 'Content-Type: application/json' \
  -d '{ "agent": "your-agent", "parameters": { "tone": "friendly" } }'
```

4) Chat on the thread:
```sh
curl -X POST http://localhost:3000/threads/<threadId>/chat \
  -H 'Content-Type: application/json' \
  -d '{ "message": "Hello there" }'
```

What happens during chat:
- User message is persisted
- Assistant may return `tool_calls`; the API persists that assistant message
- Each tool is executed and a corresponding tool result message is persisted
- The model is invoked again with the tool results, producing the final assistant message (returned by the API)

### Notes
- For Postgres, schema is created by `apps/api/scripts/migrate.ts` when you run `npm run db:up`.
- For Mongo, no migration is needed.
- The service uses LangChain; tools are bound per agent via the tools array you export.


