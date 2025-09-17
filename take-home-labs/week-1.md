## Take‑Home Lab — Week 1: Maintenance Chat Agent (API + Chat Widget)

Build a small, production‑leaning chat agent that runs through our Nest.js API and is used via the chat‑widget demo page. The agent should collect required details, detect emergencies, and invoke tools to either submit a work order or notify on‑call staff in emergencies.  Your prompt should also include a list of dynamic services not provided by the maintenance team and detect that and let the user know when they will have to solve the problem on their own.

### What you will build

Create a new agent in the API and exercise it from the chat‑widget test page. The agent should:

1) Collect the following fields from the user:
- Description of the problem
- Address (street, city, state, zip) — ask for missing parts if the user’s input is incomplete
- Phone number — request corrections if invalid
- Permission to enter — must be one of: Yes, No, Call Before

2) Decide when the conversation is an emergency and immediately escalate. Examples could include flooding, active fire/smoke, gas leak, structural collapse, earthquake damage, or other life‑safety risks. You decide exact criteria, but be explicit in your prompt.

3) Call the appropriate tool:
- submitWorkOrder(details) — invoked only after all required fields are collected and validated
- notifyOfEmergency(details) — invoked immediately when an emergency is detected (before further intake)

4) End the conversation gracefully after the tool runs.

5) Use a parameterized system prompt and enforce service limitations:
- Personalize the greeting using `companyName`, e.g., “Thanks for reaching out to {{companyName}}. How can we help you?”
- Read `servicesNotProvided` (array) and refuse requests that match items in this list with a clear response like, “I’m sorry, that’s actually not an issue we are able to handle. You will have to handle that on your own,” then offer supported alternatives.

### Where to put things

- API agent folder: `apps/api/agents/maintenance-agent/`
  - `prompt.md` — system prompt for collection + emergency policy
  - `tools.ts` — tool definitions exported as an array
- Use the chat widget to converse with the agent:
  - Start the API and chat
  - Open `http://localhost:5173/public/test.html`, set `Agent = maintenance-agent`, and test

### Tools to define

- submitWorkOrder
  - Input: { description, address: { street, city, state, zip }, phone, permissionToEnter }
  - permissionToEnter is an enum with values: "Yes" | "No" | "Call Before" (NOT boolean)
  - Output: a deterministic confirmation (e.g., workOrderId, echo of inputs)

- notifyOfEmergency
  - Input: { description, address?, phone? } — include whatever is known at the time
  - Output: a deterministic confirmation (e.g., acknowledged: true, notified: "on‑call")

### Required behaviors

- Validation & clarification
  - Ask follow‑up questions when any required field is missing or malformed
  - Confirm ambiguous addresses or phone numbers
  - Enforce permissionToEnter enum values (reject booleans/unknowns and ask again)

- Emergency handling
  - If the user’s description indicates an emergency, immediately call notifyOfEmergency
  - After emergency tool call, stop normal intake and end the session with clear guidance

- Non‑emergency happy path
  - When all fields are present and valid, call submitWorkOrder
  - Confirm to the user that the work order was created, then end the session

- Conversation engine
  - Use the existing API flow (threads service) that:
    - Accepts messages from the widget
    - Handles assistant `tool_calls`
    - Executes tools in the server process
    - Persists messages and invokes the model again as needed

### Prompt requirements

- Use a system prompt that:
  - States the agent’s role and step‑by‑step intake process
  - Defines what constitutes an emergency for your solution
  - Instructs the model to collect/validate required fields and use tools appropriately
  - Includes guardrails against prompt injection or off‑topic requests
  - Is parameterized and reacts to values provided with the thread:
    - `companyName` (string) — used in the opening greeting, e.g., “Thanks for reaching out to {{companyName}}. How can we help you?”
    - `servicesNotProvided` (string[]) — a list of services the maintenance team does NOT provide. The agent should check requests against this list and, on a match, respond with a refusal such as: “I’m sorry, that’s actually not an issue we are able to handle. You will have to handle that on your own,” and offer help with supported maintenance items.

### Run & test

1) Databases and API
   - `npm run db:up`
   - `npm run api:dev`
2) Chat widget
   - `npm run chat:dev`
   - Open `http://localhost:5173/public/test.html`
   - Enter `API URL: http://localhost:3000`, `Agent: maintenance-agent`
   - Provide Parameters (JSON), for example:
     ```json
     {
       "companyName": "Acme Property Management",
       "servicesNotProvided": ["appliance installation", "pest control", "landscaping"]
     }
     ```
3) Validate happy path and emergency path end‑to‑end in the browser

### Deliverables

- `apps/api/agents/maintenance-agent/prompt.md`
- `apps/api/agents/maintenance-agent/tools.ts`
- A short README (in the agent folder) describing:
  - Your emergency criteria
  - Any assumptions or limitations

### Acceptance checklist

- [ ] Collects description, full address (street/city/state/zip), phone, and permissionToEnter (Yes/No/Call Before)
- [ ] Validates inputs and asks clarifying questions for missing/invalid data
- [ ] Immediately calls notifyOfEmergency and stops intake when emergency is detected
- [ ] Calls submitWorkOrder only after the happy‑path intake is complete
- [ ] Works through the API and chat‑widget 
- [ ] Returns deterministic tool outputs and ends the conversation cleanly
- [ ] Uses `companyName` to personalize the greeting
- [ ] Rejects requests matching any `servicesNotProvided` item with a clear refusal

### Optional stretch goals (choose any)

- Streaming assistant responses
- Basic retry policy on transient tool/LLM failures
- Right now if the thread service detects a tool call, it will run the tool and invoke the llm again to process the result but if that results in another tool call, it does not handle that flow.  Rewrite the tool calling process to allow for multiple chained tool calls. Note, always a good idea to have a hard limit in case it gets stuck in an infinite tool loop
- Parameterized prompts can be dangerous without validating the input. How can you validate parameters passed in? Can you use another agent? Implement something to protect parameterized prompts
- With parameterized prompts, the agent may not function correctly if all the parameters aren't passsed in. Build some logic into the thread creation method to make sure the caller provides all appropriate parameters
- Implement a summarizing strategy in the thread service as done in the labs
