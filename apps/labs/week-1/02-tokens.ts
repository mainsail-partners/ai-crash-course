import { log, logSection } from "../src/services/LogService.js";

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

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
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
    "Panera's soups and bread bowls are a comfort food classic—does that earn them a spot at the top?",
    "Shake Shack's crinkle fries and shakes are iconic, but do they outshine the burgers?",
    "What about MOD Pizza—does the build-your-own pizza model stack up against the others?",
  ];

  await log(`Model selected: ${model}`);
  await log("System prompt set:", messages[0]?.content);

  for (let i = 0; i < userTurns.length; i++) {
    const userMsg = userTurns[i];
    await logSection(`TURN ${i + 1}`);

    await log(`Adding user message #${i + 1} to the thread.`);
    messages.push({ role: "user", content: userMsg ?? "" });
    await log("USER:", userMsg);

    await log(
      "Requesting assistant reply using the full conversation so far..."
    );
    const res = await client.chat.completions.create({
      model,
      messages,
    });

    const assistant = res.choices[0]?.message?.content?.trim() ?? "";
    await log("ASSISTANT:", assistant);
    await log("Reply received. Appending to the thread.");
    messages.push({ role: "assistant", content: assistant });

    const promptTokens = (res as any).usage?.prompt_tokens ?? 0;
    const completionTokens = (res as any).usage?.completion_tokens ?? 0;
    const totalTokens =
      (res as any).usage?.total_tokens ?? promptTokens + completionTokens;

    await log("Token usage for this turn:", {
      input_prompt_tokens: promptTokens || "n/a",
      output_completion_tokens: completionTokens || "n/a",
      total_tokens: totalTokens || "n/a",
      messages_in_thread: messages.length,
    });
  }
}
