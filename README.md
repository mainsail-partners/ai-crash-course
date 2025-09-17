## AI Crash Course Labs

This monorepo contains a hands-on set of small scripts for training a development team to build with LLMs. The primary focus for now is the Labs app under `apps/labs`. It includes progressively more advanced exercises demonstrating message construction, token usage, context management, summarization, and tool/function calling with LLM models.


### Prerequisites

- Node.js >= 18
- An OpenAI API key
- Ideally an API key for other foundation models like Gemini, Claude, and Grok

### Quick start

1) Install dependencies (from repo root):

```sh
npm install
```

2) Create an env file for Labs:

```sh
cp apps/labs/.env.example apps/labs/.env # if present; otherwise create manually
```

Add your credentials to `apps/labs/.env`:

```ini
OPENAI_API_KEY=sk-your-key
# Optional: override the default
OPENAI_MODEL=gpt-5-mini
```

3) Run a lab script from the repo root specifying the path to the lab. 

```sh
npm run lab week-1/04-rolling-summaries
```

You can also run from within the Labs workspace:

```sh
cd apps/labs
npm run lab week-1/05-tool-calls
```

### VS Code debugging

Launch configurations are provided in `.vscode/launch.json` for all Week 1 labs:

- Labs: Run script (prompt)
- Labs: Run 01-message-basics
- Labs: Run 02-tokens
- Labs: Run 03-last-k-messages
- Labs: Run 04-rolling-summaries
- Labs: Run 05-tool-calls
- Labs: Run 06-tool-calls-expanded
- Labs: Run 07-temperature
- Labs: Run 08-abstraction (provider prompt/openai/claude/gemini/grok)
- Labs: Run 09-prompt-management
- Labs: Run 10-prompt-management-protected
- Labs: Run 11-structured-output
- Labs: Run 12-streaming
- Labs: Run 13-contact-chatbot

These use `npm --workspace=@repo/labs run lab` and load environment variables from `apps/labs/.env`.


### What’s in Week 1

- 01-message-basics: Build a conversation with a system persona and multiple turns; summarize at the end.
- 02-tokens: Show API-reported token usage per turn.
- 03-last-k-messages: Keep only the last K messages plus the system prompt when prompting the model.
- 04-rolling-summaries: Use running summaries to compress long threads. Token counts use `@dqbd/tiktoken`.
- 05-tool-calls: Demonstrate a basic tool/function call round-trip (assistant requests tool → local function runs → tool result → assistant answer).
- 06-tool-calls-expanded: Show missing-parameter clarification before tool use; then execute tool and produce a grounded answer.
- 07-temperature: Compare low vs high temperature outputs (same prompt, multiple trials).
- 08-abstraction: Re-implements tool calling using LangChain with swappable providers (OpenAI, Claude, Gemini, Grok).
- 09-prompt-management: Loads system prompts from .md files, compiles with Handlebars parameters and conditionals, and uses LangChain for the run.
- 10-prompt-management-protected: Similar to lab 09 but with prompt injection protection.
- 11-structured-output: Runs a COA mapping prompt and parses structured JSON output via LangChain.
- 12-streaming: Streams output two ways (raw iterator and events), plus cancellation, using a menu copy optimizer prompt.
- 13-contact-chatbot: Interactive console bot that collects first/last name, email, and phone; uses tools to create a contact or end the conversation.

### Labs runner

The Labs runner (`apps/labs/src/runner.ts`) loads `apps/labs/.env`, resolves the script based on the argument you pass, and dynamically imports the corresponding `week-x/<name>.ts` file. Each script exports a default async function and logs its own teaching output.

### Notes

- These examples make real API calls. Costs may be incurred. Prefer small, affordable models (default is `gpt-5-mini`).
- Some labs log full message chains and token usage for teaching clarity.
- If a lab references tools, make sure your environment allows outgoing requests and your API key is valid.



### API (Nest.js)

After you run through the labs, you can use the API project to test a more production-like application interacting with an LLM  See below and the README.md file in the api project for more detail

- Location: `apps/api`
- Purpose: Store chat threads (single aggregate with embedded/JSONB messages) with pluggable persistence (Postgres or Mongo).
- Configure via `apps/api/.env` (copy from `.env.example`). Key vars: `PERSISTENCE`, `POSTGRES_URL` or `MONGO_URL`, `LLM_PROVIDER`, `LLM_MODEL`, provider API keys.
- Run dev:

```sh
npm run api:dev
```

- Swagger docs at `/api`.

- Endpoints:
  - `POST /threads` { agent, parameters?, model?, userMessage? }
  - `POST /threads/:id/chat` { message, metadata? }
  - `GET /threads/:id`, `GET /threads?accountId=1`, `DELETE /threads/:id`

### Local databases with Docker

This repo includes a docker-compose for Postgres and Mongo so you can run either backend locally.

1) Start databases:

```sh
npm run db:up
```

This launches:
- Postgres on `localhost:5432` (db `ai_crash_course`, user `postgres`, pass `postgres`)
- MongoDB on `localhost:27017` (db name of your choice; example uses `ai_crash_course`)

2) Configure `apps/api/.env` based on your choice:

```ini
# Postgres
PERSISTENCE=postgres
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/ai_crash_course

# or Mongo
# PERSISTENCE=mongo
# MONGO_URL=mongodb://localhost:27017/ai_crash_course
```

3) Run the API in dev mode:

```sh
npm run api:dev
```

4) Stop databases when done:

```sh
npm run db:down
```

See more details in `apps/api/README.md`.

### Adding an agent (API)

Agents live under `apps/api/agents/<agent-name>` and contain:
- `prompt.md` — the system prompt (Handlebars helpers available: `eq`, `ne`, `json`)
- `tools.ts` — exports an array of tools created via `tool(handler, { name, description, schema })`

Steps:
1) Create `apps/api/agents/your-agent/` with `prompt.md` and `tools.ts`.
2) Start DBs (`npm run db:up`) and API (`npm run api:dev`).
3) Create a thread:

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

The API persists user input, assistant tool_calls (when present), tool results, and the final assistant reply. The `chat` endpoint returns only the last assistant message.

### Chat Widget (apps/chat-widget)

A lightweight web component that embeds a chat UI on any HTML page and talks to the API.

- Location: `apps/chat-widget`
- Component: `<chat-widget>` (Lit Web Component)
- Public helpers: `initializeChatWidget(config)` attaches/updates the widget on the page

Run in dev and try the test page:

```sh
npm run chat:dev
# Then open http://localhost:5173/public/test.html
```

Build for production (outputs to `apps/chat-widget/dist`):

```sh
npm run chat:build
```

Embed options:

- Auto‑init via a single script tag using data attributes (recommended):

```html
<script
  type="module"
  src="/path/to/chat-widget/dist/assets/main.js"
  data-chat-widget
  data-api-url="http://localhost:3000"
  data-agent="lead-intake-agent"
  data-parameters='{"tone":"friendly"}'
  data-theme="light"
  data-position="bottom-right"
  data-width="400"
  data-height="600">
</script>
```

- Or initialize programmatically:

```html
<script type="module" src="/path/to/chat-widget/dist/assets/main.js"></script>
<script>
  window.initializeChatWidget({
    apiUrl: 'http://localhost:3000',
    agent: 'lead-intake-agent',
    parameters: { tone: 'friendly' },
    theme: 'light', // 'light' | 'dark'
    position: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    width: 400,
    height: 600,
  });
  // Re‑initialize with new settings later by calling initializeChatWidget again
</script>
```

Notes:
- The widget expects the API from this repo running at `data-api-url`.
- The test page includes a Reset button. In the widget, the header “×” removes the element from the DOM.

### What's next

Ready to practice? Browse the take‑home exercises in `take-home-labs/`.

- Start with `take-home-labs/week-1.md` for a guided assignment that uses the API and chat widget.
- Each lab describes objectives, required behaviors, and acceptance criteria you can verify locally.
