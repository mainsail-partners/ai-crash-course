import { log, logSection } from "../src/services/LogService.js";
import readline from "node:readline";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import { ProviderService } from "../src/services/ProviderService.js";
import { PromptService } from "../src/services/PromptService.js";

type ToolCapable = BaseChatModel & {
  bindTools: (tools: any[], kwargs?: any) => BaseChatModel;
};

function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(email);
}

function normalizePhone(input: string): string {
  const digits = String(input || "").replace(/\D+/g, "");
  return digits;
}

function isValidPhone(phone: string): boolean {
  const d = normalizePhone(phone);
  return d.length >= 10 && d.length <= 15;
}

const createContactTool = tool(
  async (input: any) => {
    const firstName = String(input?.firstName || "").trim();
    const lastName = String(input?.lastName || "").trim();
    const email = String(input?.email || "").trim();
    const phone = String(input?.phone || "").trim();

    if (!firstName || !lastName || !email || !phone) {
      return { ok: false, error: "missing_fields" };
    }
    if (!isValidEmail(email)) {
      return { ok: false, error: "invalid_email" };
    }
    if (!isValidPhone(phone)) {
      return { ok: false, error: "invalid_phone" };
    }
    // Simulate persistence
    const id = "contact_" + Math.random().toString(36).slice(2, 10);
    return {
      ok: true,
      id,
      message: `Created contact for ${firstName} ${lastName}`,
    };
  },
  {
    name: "create_contact",
    description:
      "Create a contact once firstName, lastName, email, and phone are all present and valid.",
    schema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
      },
      required: ["firstName", "lastName", "email", "phone"],
      additionalProperties: false,
    },
  }
);

const endConversationTool = tool(
  async (input: any) => {
    const reason = String(input?.reason || "user requested to end");
    return { ok: true, reason };
  },
  {
    name: "end_conversation",
    description: "Signal that the conversation should end now.",
    schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  }
);

// Centralized tool registry ties together the tool object (for binding)
// and simple metadata for generic processing
const TOOL_REGISTRY: Record<string, { tool: any; ends?: boolean }> = {
  create_contact: { tool: createContactTool },
  end_conversation: { tool: endConversationTool, ends: true },
};

async function processTurn(
  llm: any,
  messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>,
  userInput: string
): Promise<{ shouldExit: boolean }> {
  messages.push(new HumanMessage(userInput));

  const assistant = (await llm.invoke(messages)) as AIMessage;
  messages.push(assistant);

  const toolCalls = assistant.tool_calls || [];

  // No tool calls, so just return with shouldExit = false
  if (toolCalls.length === 0) {
    return { shouldExit: false };
  }

  let shouldExit = false;
  // Execute the tools generically
  for (const tc of toolCalls) {
    try {
      // Get the tool entry from the registry
      const entry = TOOL_REGISTRY[tc.name || ""];

      // If the tool is not found, add a ToolMessage indicating the failure to the conversation
      if (!entry) {
        const unknown = { ok: false, error: "unknown_tool", name: tc.name };
        messages.push(
          new ToolMessage({
            content: JSON.stringify(unknown),
            tool_call_id: tc.id ?? "",
          })
        );
        continue;
      }

      // Otherwise, invoke the tool with the parameters and add the result to the conversation
      const result = await entry.tool.invoke(tc.args);
      messages.push(
        new ToolMessage({
          content: JSON.stringify(result ?? null),
          tool_call_id: tc.id ?? "",
        })
      );

      // If the tool is an end tool, set shouldExit to true
      if (entry.ends) {
        shouldExit = true;
      }
    } catch (err) {
      const errorResult = {
        ok: false,
        error: "tool_execution_failed",
        message: String(err),
      };
      messages.push(
        new ToolMessage({
          content: JSON.stringify(errorResult),
          tool_call_id: tc.id ?? "",
        })
      );
    }
  }

  // Allow the model to read tool outputs and produce a user-visible response
  const followUp = (await llm.invoke(messages)) as AIMessage;
  messages.push(followUp);

  return { shouldExit };
}

export default async function main() {
  const apiKeyOk = !!(
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.XAI_API_KEY
  );
  if (!apiKeyOk) {
    console.error("Set provider API keys in apps/labs/.env");
    return;
  }

  const llmBase = ProviderService.buildModel(
    "openai"
  ) as unknown as ToolCapable;
  const llm = llmBase.bindTools(
    Object.values(TOOL_REGISTRY).map((e) => e.tool)
  );

  const promptService = new PromptService();
  const systemPrompt = await promptService.render("lead-intake-agent");

  const messages: Array<
    SystemMessage | HumanMessage | AIMessage | ToolMessage
  > = [new SystemMessage(systemPrompt)];

  await logSection("Contact Intake Bot");
  await log('Type "bye" to end the conversation.');
  // Let the LLM produce the initial greeting per the system prompt using processTurn
  await processTurn(llm, messages, "");
  const initial = messages[messages.length - 1] as AIMessage;
  await log("BOT:", String(initial.content ?? "").trim());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string) =>
    new Promise<string>((resolve) => rl.question(q, resolve));

  while (true) {
    const userInput = await ask("YOU: ");
    const { shouldExit } = await processTurn(llm, messages, userInput);
    const last = messages[messages.length - 1] as AIMessage;
    await log("BOT:", String(last.content ?? "").trim());
    if (shouldExit) {
      await log("BOT: Thanks! Ending our chat now.");
      break;
    }
  }

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

  rl.close();
}
