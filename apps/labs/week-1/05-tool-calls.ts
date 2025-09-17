// 05-tool-calls
// Goal: Demonstrate a basic tool/function call flow with OpenAI.
// Flow:
// 1) User asks about restaurants.
// 2) Assistant requests the tool with arguments.
// 3) We run our local function and return the results as a tool message.
// 4) Assistant uses the tool output to produce a final answer.

// Teaching note: Using simplified/custom types below for readability in training.
// In production, prefer the official OpenAI SDK types:
// - ChatCompletionMessageParam
// - ChatCompletionAssistantMessageParam (with ChatCompletionMessageToolCall[])
// - ChatCompletionToolMessageParam
// - ChatCompletionTool
// Example imports:
//   import {
//     ChatCompletionMessageParam,
//     ChatCompletionTool,
//     ChatCompletionToolMessageParam,
//     ChatCompletionAssistantMessageParam,
//     ChatCompletionMessageToolCall,
//   } from 'openai/resources/chat/completions';

import { log, logSection } from "../src/services/LogService.js";

type Role = "system" | "user" | "assistant" | "tool";
type AssistantToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type AssistantMsg = {
  role: "assistant";
  content?: string | null;
  tool_calls?: AssistantToolCall[];
};
type BaseMsg = { role: "system" | "user"; content: string };
type ToolMsg = { role: "tool"; content: string; tool_call_id: string };
type Msg = BaseMsg | AssistantMsg | ToolMsg;

type RestaurantStats = {
  chain: string;
  health_score: number; // 0-100 higher is healthier
  price_level: "$" | "$$" | "$$$";
  top_item: string;
  avg_calories_signature_item: number;
};

const RESTAURANT_DB: Record<string, RestaurantStats> = {
  chipotle: {
    chain: "Chipotle",
    health_score: 74,
    price_level: "$$",
    top_item: "Chicken burrito bowl",
    avg_calories_signature_item: 690,
  },
  "chick-fil-a": {
    chain: "Chick-fil-A",
    health_score: 58,
    price_level: "$",
    top_item: "Chicken sandwich",
    avg_calories_signature_item: 440,
  },
  "in-n-out": {
    chain: "In-N-Out",
    health_score: 55,
    price_level: "$",
    top_item: "Double-Double",
    avg_calories_signature_item: 670,
  },
  "shake shack": {
    chain: "Shake Shack",
    health_score: 60,
    price_level: "$$",
    top_item: "ShackBurger",
    avg_calories_signature_item: 700,
  },
};

function normalizeChainName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, "");
}

function getRestaurantStats(chain: string): RestaurantStats | null {
  const key = normalizeChainName(chain);
  const direct = RESTAURANT_DB[key];
  if (direct) return direct;
  // simple aliasing
  const from = (name: string): RestaurantStats | null => {
    const v = RESTAURANT_DB[name];
    return v ?? null;
  };
  if (key.includes("chipotle")) return from("chipotle");
  if (key.includes("chick")) return from("chick-fil-a");
  if (key.includes("in") && key.includes("out")) return from("in-n-out");
  if (key.includes("shake")) return from("shake shack");
  return null;
}

export default async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set OPENAI_API_KEY in apps/labs/.env");
    return;
  }

  await log("OPENAI_API_KEY found. Initializing OpenAI client...");
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  await log("OpenAI client initialized.");

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  // Define tools. We expose one function the model can call.
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_restaurant_stats",
        description:
          "Look up basic health/value stats for a fast-casual restaurant by name. Returns health score, price, and top item.",
        // json schema for the function to define what parameters are allowed/required
        parameters: {
          type: "object",
          properties: {
            chain: {
              type: "string",
              description:
                'The restaurant brand name to look up (e.g., "Chipotle", "Chick-fil-A").',
            },
          },
          required: ["chain"],
          additionalProperties: false,
        },
      },
    },
  ];

  // System guidance: ask the model to use the tool when needed.
  const messages: Msg[] = [
    {
      role: "system",
      content:
        "You are a concise food analyst. When asked about specific restaurants, call the tool to fetch stats before giving a final answer. Keep replies to 3-5 sentences.",
    },
  ];

  // A user asks a question that should trigger a tool call
  const userQuestion =
    "Compare the healthiness and value of Chipotle and Chick-fil-A, and pick a winner.";
  messages.push({ role: "user", content: userQuestion });
  await logSection("TOOL CALL FLOW");
  await log(`Model selected: ${model}`);
  await log("USER:", userQuestion);

  // 1) First call: expect a tool call request
  const first = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  const firstMsg = first.choices[0]?.message;

  if (!firstMsg) {
    await log("No first assistant message.");
    return;
  }

  // Push the assistant message (with tool_calls) into the thread before tool responses
  // On the follow-up call to the assistant, we need to include the tool_calls so the assistant can see them
  messages.push({
    role: "assistant",
    content: firstMsg.content ?? "",
    tool_calls: (firstMsg as any).tool_calls,
  });

  // Token usage for the first call
  const firstUsage = (first as any).usage || {};
  await log("First call usage (tokens):", {
    prompt_tokens: firstUsage.prompt_tokens ?? "n/a",
    completion_tokens: firstUsage.completion_tokens ?? "n/a",
    total_tokens: firstUsage.total_tokens ?? "n/a",
  });

  // Log any tool calls the assistant requested
  const toolCalls = (firstMsg as any).tool_calls || [];
  if (toolCalls.length === 0) {
    await log("Assistant did not request any tool calls. Full message:");
    await log(firstMsg);
    return;
  }

  await log("Assistant requested tool calls:");
  for (const tc of toolCalls) {
    await log(
      `- ${tc.function?.name}(${tc.function?.arguments}) → id=${tc.id}`
    );
  }

  // 2) Execute the tool(s) locally and add their results to the conversation. Note the loop as the request
  //    can result in multiple tool calls
  for (const tc of toolCalls) {
    if (tc.type !== "function") continue;

    const fnName = tc.function?.name;
    const rawArgs = tc.function?.arguments || "{}";
    let result: unknown = null;
    try {
      // parse the arguments into a JSON object
      const parsed = JSON.parse(rawArgs || "{}");

      // call the tool based on the function name passed to the LLM
      if (fnName === "get_restaurant_stats") {
        // Run the actual code for the tool call
        const chain = String(parsed.chain || "");
        result = getRestaurantStats(chain);
      }
    } catch (e) {
      result = { error: "Failed to parse arguments", rawArgs };
    }

    await log(`Local tool execution for ${fnName}:`, result);

    // add the tool result to the conversation
    // note the need to reference the tool_call_id so the assistant can see it
    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(result ?? null),
    });
  }

  // 3) Second call: assistant uses the tool outputs to answer

  // Log the full message chain as JSON so students can see exactly what is sent to the LLM
  await logSection("Full Message Chain with tool calls and tool results");
  await log(
    JSON.stringify(
      messages.map((m) => {
        // Show all fields, including tool_calls/tool_call_id if present
        const out: any = { role: (m as any).role, content: (m as any).content };
        if ("tool_calls" in (m as any) && (m as any).tool_calls)
          out.tool_calls = (m as any).tool_calls;
        if ("tool_call_id" in (m as any) && (m as any).tool_call_id)
          out.tool_call_id = (m as any).tool_call_id;
        return out;
      }),
      null,
      2
    )
  );

  const second = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  const finalMsg = second.choices[0]?.message?.content?.trim() || "";

  // Token usage for the second call
  const secondUsage = (second as any).usage || {};
  await log("Second call usage (tokens):", {
    prompt_tokens: secondUsage.prompt_tokens ?? "n/a",
    completion_tokens: secondUsage.completion_tokens ?? "n/a",
    total_tokens: secondUsage.total_tokens ?? "n/a",
  });

  await log("ASSISTANT (final):", finalMsg);
}
