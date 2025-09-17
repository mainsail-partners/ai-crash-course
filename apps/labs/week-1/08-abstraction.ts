// 08-abstraction (LangChain)
// Goal: Recreate the 05-tool-calls lab using LangChain as a model abstraction,
// and allow swapping providers (openai | claude | gemini | grok) via CLI arg.
import { log, logSection } from "../src/services/LogService.js";
import { tool } from "@langchain/core/tools";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  ProviderService,
  type Provider as ModelProvider,
} from "../src/services/ProviderService.js";

type Provider = ModelProvider;
type ToolCapable = BaseChatModel & {
  bindTools: (tools: any[], kwargs?: any) => BaseChatModel;
};

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
  if (key.includes("chipotle")) return RESTAURANT_DB["chipotle"] ?? null;
  if (key.includes("chick")) return RESTAURANT_DB["chick-fil-a"] ?? null;
  if (key.includes("in") && key.includes("out"))
    return RESTAURANT_DB["in-n-out"] ?? null;
  if (key.includes("shake")) return RESTAURANT_DB["shake shack"] ?? null;
  return null;
}

// Define the tool using JSON Schema and LangChain's tool helper
const getRestaurantStatsTool = tool(
  // LangChain's tool helper expects a function that takes the input and returns the result
  async (input: unknown) => {
    const chain =
      typeof input === "object" && input && "chain" in (input as any)
        ? (input as any).chain
        : "";
    const result = getRestaurantStats(String(chain));
    return result ?? { error: "Unknown restaurant", chain };
  },
  // LangChain's tool helper expects a schema object to define the input parameters
  {
    name: "get_restaurant_stats",
    description:
      "Look up basic health/value stats for a fast-casual restaurant by name. Returns health score, price, and top item.",
    schema: {
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
  }
);

function resolveProvider(): Provider {
  // Accept provider from CLI arg or env PROVIDER
  const arg = process.argv[3]?.toLowerCase();
  const env = (process.env.PROVIDER || "").toLowerCase();
  const cand = (arg || env) as Provider;
  if (
    cand === "openai" ||
    cand === "claude" ||
    cand === "gemini" ||
    cand === "grok"
  )
    return cand;
  return "openai";
}

function checkProviderEnv(provider: Provider): {
  ok: boolean;
  message?: string;
} {
  switch (provider) {
    case "openai":
      return {
        ok: !!process.env.OPENAI_API_KEY,
        message: "Set OPENAI_API_KEY in apps/labs/.env",
      };
    case "claude":
      return {
        ok: !!process.env.ANTHROPIC_API_KEY,
        message: "Set ANTHROPIC_API_KEY in apps/labs/.env",
      };
    case "gemini":
      return {
        ok: !!process.env.GOOGLE_API_KEY,
        message: "Set GOOGLE_API_KEY in apps/labs/.env",
      };
    case "grok":
      return {
        ok: !!process.env.XAI_API_KEY,
        message: "Set XAI_API_KEY in apps/labs/.env",
      };
  }
}

export default async function main() {
  // Basic OpenAI key check as runner uses it often; specific provider checks below
  const apiKeyPresent = !!(
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.XAI_API_KEY
  );
  if (!apiKeyPresent) {
    console.error(
      "Set provider API keys in apps/labs/.env (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or XAI_API_KEY)."
    );
    return;
  }

  const provider = resolveProvider();
  const envOk = checkProviderEnv(provider);
  if (!envOk.ok) {
    console.error(envOk.message);
    return;
  }

  // Get the llm model based on the parameters passed in
  const llm = ProviderService.buildModel(provider) as unknown as ToolCapable;
  // Add the tools to the model
  const llmWithTools = llm.bindTools([getRestaurantStatsTool]);

  await logSection("LangChain Tool Calls");
  await log(`Provider selected: ${provider}`);

  // Build the system and "human"/user messages and LangChain calls it
  const system = new SystemMessage(
    "You are a concise food analyst. When asked about specific restaurants, call the tool to fetch stats before giving a final answer. Keep replies to 3-5 sentences."
  );
  const userPrompt =
    "Compare the healthiness and value of Chipotle and Chick-fil-A, and pick a winner.";
  const user = new HumanMessage(userPrompt);
  await log("USER:", userPrompt);
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] =
    [];
  messages.push(system);
  messages.push(user);

  // 1) First call — expect tool calls
  const first = (await llmWithTools.invoke(messages)) as AIMessage;
  const toolCalls = first.tool_calls || [];
  if (toolCalls.length === 0) {
    await log("Assistant did not request any tool calls. Full message:");
    await log(first.content);
    return;
  }

  await log("Assistant requested tool calls:");
  for (const tc of toolCalls) {
    await log(`- ${tc.name}(${JSON.stringify(tc.args)}) → id=${tc.id}`);
  }

  // 2) Execute tools locally and add ToolMessages
  messages.push(first);
  for (const tc of toolCalls) {
    try {
      if (tc.name === "get_restaurant_stats") {
        // Invoke the tool using the tool helper
        let result = await getRestaurantStatsTool.invoke(tc);

        // Add the tool result to the conversation
        messages.push(
          new ToolMessage({
            content: JSON.stringify(result.content ?? null),
            tool_call_id: tc.id ?? "",
          })
        );

        await log(`Local tool execution for ${tc.name}:`, result.content);
      }
    } catch (e) {
      // If the tool fails, add a ToolMessage indicating the failure to the conversation
      messages.push(
        new ToolMessage({
          content: JSON.stringify({
            error: "Failed to run tool",
            rawArgs: tc.args,
          }),
          tool_call_id: tc.id ?? "",
        })
      );
    }
  }

  // 3) Second call — assistant uses tool outputs to answer
  const second = (await llmWithTools.invoke(messages)) as AIMessage;
  const finalText = String(second.content ?? "");
  await log("ASSISTANT (final):", finalText.trim());
  messages.push(second);

  await logSection("Full Message Chain with tool calls and tool results");
  await log(
    JSON.stringify(
      messages.map((m) => {
        const out: any = { role: m.getType(), content: m.content };
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
}
