// 07-temperature
// Goal: Demonstrate the impact of sampling temperature while holding other knobs constant.
// This runs multiple trials at low vs high temperature using the same messages,
// then prints and contrasts the outputs.

import { log, logSection } from "../src/services/LogService.js";

type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };

function createBaseMessages(): Msg[] {
  // Keep consistent persona and a prompt that invites variation
  const system: Msg = {
    role: "system",
    content:
      "You are a contrarian but concise food critic. Keep replies to exactly 2 sentences. Name one specific menu item and include one playful jab.",
  };
  const user: Msg = {
    role: "user",
    content:
      "Give a contrarian take on the best fast-casual chain. Name a specific menu item and include one playful jab.",
  };
  return [system, user];
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

  // Note gpt-5 has its own internal router that sets a number of these knobs on its own so we
  // have to use a different model for this lab
  const model = "gpt-4o-mini";

  // Fixed knobs (hold constant across trials to isolate temperature)
  const FIXED = {
    top_p: 1, // Consider the full distribution of tokens so only temperature matters
    presence_penalty: 0,
    frequency_penalty: 0,
  } as const;

  // Trial settings
  const lowTemperature = 0.2;
  const highTemperature = 1.0;
  const trialsPerSetting = 3;
  const lowTempSeed = 7; // Optional: seed for increased reproducibility at low temp

  await log(`Model selected: ${model}`);
  await log("Comparing outputs at two temperatures with identical prompts.");
  await log(
    "Low temperature encourages determinism; high temperature encourages diversity."
  );

  async function runTrials(
    temperature: number,
    trials: number,
    opts?: { seed?: number }
  ) {
    const outputs: Array<{ text: string; usage: any }> = [];
    for (let i = 0; i < trials; i++) {
      const messages = createBaseMessages();
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature,
        top_p: FIXED.top_p,
        presence_penalty: FIXED.presence_penalty,
        frequency_penalty: FIXED.frequency_penalty,
        seed: opts?.seed,
      } as any);
      const text = res.choices[0]?.message?.content?.trim() ?? "";
      outputs.push({ text, usage: (res as any).usage || {} });
    }
    return outputs;
  }

  await logSection(
    `Low temperature (${lowTemperature}) — ${trialsPerSetting} trials`
  );
  const low = await runTrials(lowTemperature, trialsPerSetting, {
    seed: lowTempSeed,
  });
  for (let idx = 0; idx < low.length; idx++) {
    const o = low[idx]!;
    await log(`[Low t] Trial ${idx + 1}`);
    await log(o.text);
    await log("Usage (tokens):", {
      prompt_tokens: o.usage?.prompt_tokens ?? "n/a",
      completion_tokens: o.usage?.completion_tokens ?? "n/a",
      total_tokens: o.usage?.total_tokens ?? "n/a",
    });
  }

  await logSection(
    `High temperature (${highTemperature}) — ${trialsPerSetting} trials`
  );
  const high = await runTrials(highTemperature, trialsPerSetting);
  for (let idx = 0; idx < high.length; idx++) {
    const o = high[idx]!;
    await log(`[High t] Trial ${idx + 1}`);
    await log(o.text);
    await log("Usage (tokens):", {
      prompt_tokens: o.usage?.prompt_tokens ?? "n/a",
      completion_tokens: o.usage?.completion_tokens ?? "n/a",
      total_tokens: o.usage?.total_tokens ?? "n/a",
    });
  }

  // Brief teaching summary
  await logSection("Summary");
  await log(
    "Low temperature should yield more similar phrasing; high temperature should show more variety."
  );
}
