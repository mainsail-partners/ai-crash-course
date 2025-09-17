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

  // Start the thread with a system message defining the assistant's role
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

  // Three back-and-forth user prompts to demonstrate the thread
  const userTurns = [
    "I think Chipotle is the best fast casual spot—customizable bowls, fresh salsas. What do you think?",
    "But for value and consistency, it is hard to go wrong with In-n-Out, don't you think?",
    "Then again, there are some crazy fans of Chick-fil-A, even with their sad chicken sandwich with just two little pickles.",
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
  }

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
    "Requesting a concise summary (3-4 short sentences) of the conversation..."
  );
  const summarize = await client.chat.completions.create({
    model,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Summarize this conversation in 3-4 concise bullet-like sentences: core positions, key comparisons, and the final stance. No markdown, no bullets—just short sentences.",
      },
    ],
  });

  const summary = summarize.choices[0]?.message?.content?.trim() ?? "";
  await log(summary);
}
