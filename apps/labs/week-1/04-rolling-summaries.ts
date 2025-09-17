// 04-rolling-summaries
// Goal: Demonstrate how to collapse long conversation history into a concise summary
// so the prompt does not overflow the model's context window.
// This script simulates a small context window and performs a rolling summary
// whenever the prompt grows past a threshold. It then validates that early details are retained.

import { get_encoding, type Tiktoken } from "@dqbd/tiktoken";
import { log, logSection } from "../src/services/LogService.js";

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

// Very rough token estimator counting tokens in case tiktoken fails (not exact): ~4 chars ≈ 1 token
function estimateTokensApprox(text: string): number {
  const chars = text.replace(/\s+/g, " ").trim().length;
  return Math.ceil(chars / 4);
}

function estimateMessagesTokens(messages: Msg[]): number {
  const joined = messages.map((m) => `[${m.role}] ${m.content}`).join("\n");
  return estimateTokensApprox(joined);
}

function makeTokenCounter(encoding: Tiktoken) {
  return (messages: Msg[]): number => {
    try {
      const joined = messages.map((m) => `[${m.role}] ${m.content}`).join("\n");
      return encoding.encode(joined).length;
    } catch {
      return estimateMessagesTokens(messages);
    }
  };
}

async function summarizeRunningHistory(opts: {
  client: any;
  model: string;
  messages: Msg[];
}): Promise<string> {
  const { client, model, messages } = opts;
  // Build transcript excluding system message
  const transcript = messages
    .slice(1)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const summaryRes = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "Keep a concise running summary of this conversation for future turns.  Include factual preferences, rationales, decisions, constraints, and important feedback. Preserve brand/product names and specific claims so they can be referenced later. Limit to 10 lines, in plain text.",
      },
      {
        role: "user",
        content:
          "Update the running summary to reflect the full conversation so far. Be faithful and concise.\n\nTranscript follows:\n" +
          transcript,
      },
    ],
  });

  return summaryRes.choices[0]?.message?.content?.trim() ?? "";
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

  // Choose a small/affordable model for demos
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  // Simulated tiny context window threshold (very small for demo)
  // In real scenarios you'd use the model's true context size minus a safety margin.
  const CONTEXT_TOKEN_LIMIT = 1750;
  const SAFETY_MARGIN = 100; // leave room for the next user turn and response
  const TARGET_MAX_PROMPT_TOKENS = CONTEXT_TOKEN_LIMIT - SAFETY_MARGIN;

  // Initialize tiktoken (use cl100k_base which suits GPT-5 style models)
  const encoding = get_encoding("cl100k_base");
  const countTokens = makeTokenCounter(encoding);

  // Conversation setup (same theme as other labs)
  const systemMsg: Msg = {
    role: "system",
    content:
      "You are an articulate but concise food critic debating the best fast casual restaurant. Make your replies verbose, 5 to 6 sentences, " +
      "cite specific menu items, taste, health, value, and consistency. Be snarky, sarcastic, and a general contrarian.",
  };
  const messages: Msg[] = [systemMsg];

  const userTurns = [
    "I think Chipotle is the best fast casual spot—customizable bowls, fresh salsas. What do you think?",
    "For value and consistency, In-N-Out seems hard to beat—agree or disagree?",
    "Chick-fil-A has fans, but that plain chicken sandwich with two little pickles feels underwhelming—overrated?",
    "Between Sweetgreen and CAVA, which is the healthier pick and why?",
    "Does Panera’s soup and bread bowl combo count as fast casual excellence or nostalgia bait?",
    "Shake Shack’s crinkle fries and shakes are iconic—do they carry the burgers or complement them?",
    "How does MOD Pizza stack up with build-your-own variety compared to Chipotle’s bowl customization?",
    "Qdoba versus Chipotle—does queso being standard tip the scales meaningfully?",
    "If you had to crown a winner overall today, which chain and what top item?",
  ];

  await log(`Model selected: ${model}`);
  await log(
    "Simulated prompt token target (approx):",
    TARGET_MAX_PROMPT_TOKENS
  );

  // Conversation loop: at each turn, check if we should summarize after asking the model in preparation for the next call
  let runningSummary = "";

  for (let i = 0; i < userTurns.length; i++) {
    await logSection(`TURN ${i + 1}`);
    const userMsg = userTurns[i];
    const currentUser: Msg = { role: "user", content: userMsg ?? "" };
    messages.push(currentUser);
    await log("USER:", userMsg);

    const res = await client.chat.completions.create({ model, messages });
    const assistant = res.choices[0]?.message?.content?.trim() ?? "";
    messages.push({ role: "assistant", content: assistant });
    await log("ASSISTANT:", assistant);

    const usage = (res as any).usage || {};
    await log("Usage (tokens):", {
      prompt_tokens: usage.prompt_tokens ?? "n/a",
      completion_tokens: usage.completion_tokens ?? "n/a",
      total_tokens: usage.total_tokens ?? "n/a",
    });

    const approxPromptNext = countTokens(messages);
    await log("Prompt tokens (tiktoken) for next turn:", approxPromptNext);

    // Check AFTER the call so the prompt is ready for the next turn
    const mustSummarizePost = approxPromptNext > TARGET_MAX_PROMPT_TOKENS;
    if (mustSummarizePost) {
      await logSection("Rolling summary triggered (post-call)");
      runningSummary = await summarizeRunningHistory({
        client,
        model,
        messages,
      });
      await log("Updated Summary (post-call):\n", runningSummary);

      // Keep last K pairs (user+assistant) from history
      const K = 2;
      const nonSystemAll = messages.slice(1);
      const tailAll = nonSystemAll.slice(
        Math.max(0, nonSystemAll.length - K * 2)
      );

      messages.length = 0;
      messages.push(
        systemMsg,
        {
          role: "assistant",
          content: `Running summary of the conversation so far:\n${runningSummary}`,
        },
        ...tailAll
      );

      const approxAfterRebuildPost = countTokens(messages);
      await log(
        "Prompt tokens (tiktoken) after post-call rebuild:",
        approxAfterRebuildPost
      );
    }
  }

  // Final validation question that depends on early context
  const validationQuestion =
    "Earlier, which chain was criticized for having a plain chicken sandwich with two little pickles? Answer in one short sentence.";
  messages.push({ role: "user", content: validationQuestion });
  await logSection("VALIDATION");
  await log("VALIDATION USER:", validationQuestion);

  const validateRes = await client.chat.completions.create({ model, messages });
  const validateAnswer = validateRes.choices[0]?.message?.content?.trim() ?? "";
  await log("VALIDATION ASSISTANT:", validateAnswer);

  const usageVal = (validateRes as any).usage || {};
  await log("Validation usage (tokens):", {
    prompt_tokens: usageVal.prompt_tokens ?? "n/a",
    completion_tokens: usageVal.completion_tokens ?? "n/a",
    total_tokens: usageVal.total_tokens ?? "n/a",
  });

  // Print the entire conversation in json format
  await logSection("Full Conversation (JSON)");
  await log(
    JSON.stringify(
      messages.map((m) => ({ role: m.role, message: m.content })),
      null,
      2
    )
  );

  await logSection("Summary");
  await log(
    "Done. This demonstrates rolling summarization to retain key facts while keeping the prompt size small."
  );

  // Free the encoding resources
  encoding.free();
}
