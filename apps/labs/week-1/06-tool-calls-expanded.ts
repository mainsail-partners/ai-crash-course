// 06-tool-calls-expanded
// Goal: Demonstrate tool use when a required parameter is missing.
// Flow:
// 1) User asks to compare two restaurants but omits the required `criterion`.
// 2) Assistant should ask a clarifying question to get the missing `criterion`.
// 3) User provides the criterion.
// 4) Assistant calls the tool with complete arguments.
// 5) We execute the tool locally, add a tool message, and the assistant replies with a final answer.

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

function getStats(chain: string): RestaurantStats | null {
  const key = normalizeChainName(chain);
  const direct = RESTAURANT_DB[key];
  if (direct) return direct;
  if (key.includes("chipotle")) return RESTAURANT_DB["chipotle"] ?? null;
  if (key.includes("chick")) return RESTAURANT_DB["chick-fil-a"] ?? null;
  if (key.includes("in") && key.includes("out"))
    return RESTAURANT_DB["in-n-out"] ?? null;
  if (key.includes("shake")) return RESTAURANT_DB["shake shack"] ?? null;
  return null;
}

type Criterion = "health" | "value" | "calories";

function compareRestaurants(args: {
  chain_a: string;
  chain_b: string;
  criterion: Criterion;
}) {
  const a = getStats(args.chain_a);
  const b = getStats(args.chain_b);
  if (!a || !b) {
    return {
      ok: false,
      error: "One or both restaurants are unknown.",
      input: args,
    };
  }
  if (args.criterion === "health") {
    const winner = a.health_score >= b.health_score ? a.chain : b.chain;
    return {
      ok: true,
      winner,
      criterion: args.criterion,
      scores: { [a.chain]: a.health_score, [b.chain]: b.health_score },
      reason: `${winner} has the higher health score.`,
    };
  }
  if (args.criterion === "value") {
    const priceRank = (p: RestaurantStats["price_level"]) =>
      p === "$" ? 1 : p === "$$" ? 2 : 3;
    const winner =
      priceRank(a.price_level) <= priceRank(b.price_level) ? a.chain : b.chain;
    return {
      ok: true,
      winner,
      criterion: args.criterion,
      scores: { [a.chain]: a.price_level, [b.chain]: b.price_level },
      reason: `${winner} offers a lower price level on average.`,
    };
  }
  // calories
  const winner =
    a.avg_calories_signature_item <= b.avg_calories_signature_item
      ? a.chain
      : b.chain;
  return {
    ok: true,
    winner,
    criterion: args.criterion,
    scores: {
      [a.chain]: a.avg_calories_signature_item,
      [b.chain]: b.avg_calories_signature_item,
    },
    reason: `${winner} has fewer calories on its signature item on average.`,
  };
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

  const tools = [
    {
      type: "function" as const,
      function: {
        name: "compare_restaurants",
        description:
          "Compare two fast-casual restaurants on a specific criterion and return the winner with reasoning.",
        parameters: {
          type: "object",
          properties: {
            // Three parameters are required for the tool call
            chain_a: {
              type: "string",
              description: "First restaurant brand name",
            },
            chain_b: {
              type: "string",
              description: "Second restaurant brand name",
            },
            criterion: {
              type: "string",
              enum: ["health", "value", "calories"],
              description: "Comparison focus: health | value | calories",
            },
          },
          required: ["chain_a", "chain_b", "criterion"],
          additionalProperties: false,
        },
      },
    },
  ];

  const messages: Msg[] = [
    {
      role: "system",
      content:
        "You help compare restaurants using a tool. If a required tool parameter is missing (e.g., criterion), ask one concise clarifying question to gather it. Do not call the tool until all required parameters are available.",
    },
  ];

  // User omits the required `criterion`
  const initial = "Compare Chipotle and Chick-fil-A and pick a winner.";
  messages.push({ role: "user", content: initial });

  await log(`Model selected: ${model}`);
  await log("USER:", initial);

  // First call — expect a clarification question (no tool_calls)
  const first = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  const firstMsg = first.choices[0]?.message;
  const firstToolCalls = (firstMsg as any)?.tool_calls || [];

  if (!firstMsg) {
    await log("No assistant response on first turn.");
    return;
  }

  // Only include tool_calls when present; empty arrays are invalid for the API
  if (firstToolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: firstMsg.content ?? "",
      tool_calls: firstToolCalls,
    });
  } else {
    messages.push({ role: "assistant", content: firstMsg.content ?? "" });
  }

  // Token usage for the first call
  const firstUsage = (first as any).usage || {};
  await log("First call usage (tokens):", {
    prompt_tokens: firstUsage.prompt_tokens ?? "n/a",
    completion_tokens: firstUsage.completion_tokens ?? "n/a",
    total_tokens: firstUsage.total_tokens ?? "n/a",
  });

  if (firstToolCalls.length > 0) {
    await log("Assistant attempted a tool call immediately:", firstToolCalls);
    await log("For teaching, we will still demonstrate clarification.");
  } else {
    await log("ASSISTANT (clarifying):", firstMsg.content);
  }

  // Simulate user providing the missing parameter.
  const chosenCriterion: Criterion = "health";
  const followUp = `Criterion: ${chosenCriterion}.`;
  messages.push({ role: "user", content: followUp });
  await log("USER (follow-up):", followUp);

  // Second call — now expect a tool call with complete args
  const second = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  const secondMsg = second.choices[0]?.message;
  const secondToolCalls = (secondMsg as any)?.tool_calls || [];

  if (!secondMsg) {
    await log("No assistant response on second turn.");
    return;
  }

  if (secondToolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: secondMsg.content ?? "",
      tool_calls: secondToolCalls,
    });
  } else {
    messages.push({ role: "assistant", content: secondMsg.content ?? "" });
  }

  // Token usage for the second call
  const secondUsage = (second as any).usage || {};
  await log("Second call usage (tokens):", {
    prompt_tokens: secondUsage.prompt_tokens ?? "n/a",
    completion_tokens: secondUsage.completion_tokens ?? "n/a",
    total_tokens: secondUsage.total_tokens ?? "n/a",
  });

  if (secondToolCalls.length === 0) {
    await log(
      "Assistant did not issue tool calls after clarification. Full message:"
    );
    await log(secondMsg);
    return;
  }

  await log("Assistant requested tool calls:");
  for (const tc of secondToolCalls) {
    await log(
      `- ${tc.function?.name}(${tc.function?.arguments}) → id=${tc.id}`
    );
  }

  // Execute tool(s) locally and add tool messages
  for (const tc of secondToolCalls) {
    if (tc.type !== "function") continue;
    const fnName = tc.function?.name;
    const rawArgs = tc.function?.arguments || "{}";
    let result: unknown = null;
    try {
      const parsed = JSON.parse(rawArgs || "{}");
      if (fnName === "compare_restaurants") {
        const args = {
          chain_a: String(parsed.chain_a || ""),
          chain_b: String(parsed.chain_b || ""),
          criterion: String(parsed.criterion || "") as Criterion,
        };
        result = compareRestaurants(args);
      }
    } catch (e) {
      result = { ok: false, error: "Failed to parse arguments", rawArgs };
    }

    await log(`Local tool execution for ${fnName}:`, result);

    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(result ?? null),
    });
  }

  const final = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  const finalMsg = final.choices[0]?.message?.content?.trim() || "";
  // Token usage for the final call
  const finalUsage = (final as any).usage || {};
  await log("Final call usage (tokens):", {
    prompt_tokens: finalUsage.prompt_tokens ?? "n/a",
    completion_tokens: finalUsage.completion_tokens ?? "n/a",
    total_tokens: finalUsage.total_tokens ?? "n/a",
  });
  await log("ASSISTANT (final):", finalMsg);

  messages.push({ role: "assistant", content: finalMsg ?? "" });

  // Third call — assistant uses tool output to finalize
  await logSection("Full Message Chain (for teaching)");
  await log(
    JSON.stringify(
      messages.map((m) => {
        const out: any = { role: m.role, content: (m as any).content };
        if ((m as any).tool_calls) out.tool_calls = (m as any).tool_calls;
        if ((m as any).tool_call_id) out.tool_call_id = (m as any).tool_call_id;
        return out;
      }),
      null,
      2
    )
  );
}
