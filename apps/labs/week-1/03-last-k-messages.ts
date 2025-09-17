// 03-k-past-messages
// Goal: Demonstrate a simple context strategy that keeps only the last K messages
// when building the prompt, to avoid exceeding the context window.

import { log, logSection } from "../src/services/LogService.js";

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

function lastKMessages(messages: Msg[], k: number): Msg[] {
  // Keep the system prompt if present, and then only the last k non-system messages
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  // Keep the rest of the messages
  const rest = messages.slice(system.length);
  // Keep the last k messages
  const tail = rest.slice(Math.max(0, rest.length - k));
  // Return the system prompt and the last k messages
  return [...system, ...tail];
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
  const K = 2; // keep last 2 messages (user/assistant mixed) + system prompt

  const messages: Msg[] = [
    {
      role: "system",
      content:
        "You are an articulate but concise food critic debating the best fast casual restaurant. Keep replies to 1–2 sentences, " +
        "cite specific menu items, taste, health, value, and consistency. Be snarky, sarcastic, and a general contrarian.",
    },
  ];

  const userTurns = [
    "I think Chipotle is the best fast casual spot—customizable bowls, fresh salsas. What do you think?",
    "For value and consistency, In-N-Out seems hard to beat—agree or disagree?",
    "Some fans swear by Chick-fil-A—do you buy the hype or is it overrated?",
    "Between Sweetgreen and CAVA, which is the healthier pick and why?",
    "If you had to crown a winner overall today, which chain and your top item?",
    "What was the first restaurant I brought up?",
  ];

  await log(`Model selected: ${model}`);
  await log("Strategy: Keep only last K messages (K=2) plus system prompt");

  for (let i = 0; i < userTurns.length; i++) {
    await logSection(`TURN ${i + 1}`);
    const userMsg = userTurns[i];

    await log(`Adding user message #${i + 1} to the thread.`);
    messages.push({ role: "user", content: userMsg ?? "" });
    await log("USER:", userMsg);

    // Build a trimmed view: system + last K messages
    const trimmed = lastKMessages(messages, K);
    await log(
      "Requesting assistant reply using only the last K messages + system..."
    );
    const res = await client.chat.completions.create({
      model,
      messages: trimmed,
    });
    const assistant = res.choices[0]?.message?.content?.trim() ?? "";
    await log("ASSISTANT:", assistant);
    await log("Reply received. Appending to the full thread.");
    messages.push({ role: "assistant", content: assistant });

    // Token usage (from API response)
    const promptTokens = (res as any).usage?.prompt_tokens;
    const completionTokens = (res as any).usage?.completion_tokens;
    const totalTokens = (res as any).usage?.total_tokens;
    await log("Token usage for this turn:", {
      input_prompt_tokens: promptTokens ?? "n/a",
      output_completion_tokens: completionTokens ?? "n/a",
      total_tokens: totalTokens ?? "n/a",
      messages_in_thread: messages.length,
      included_messages_in_prompt: trimmed.length,
    });

    await log("Included messages messages in prompt (role: preview):");
    for (const m of trimmed) {
      await log(
        `- ${m.role}:`,
        (m.content || "").slice(0, 100).replace(/\s+/g, " "),
        "..."
      );
    }
  }

  await log(
    "Done. This demonstrates the last-K strategy to keep prompts small."
  );
}
