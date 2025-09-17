import { log, logSection } from "../src/services/LogService.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ProviderService } from "../src/services/ProviderService.js";
import { PromptService } from "../src/services/PromptService.js";

export default async function main() {
  const apiKeyOk = !!process.env.OPENAI_API_KEY;
  if (!apiKeyOk) {
    console.error("Set OPENAI_API_KEY in apps/labs/.env");
    return;
  }

  const llm = ProviderService.buildModel("openai");

  // Build small demo COAs
  const oldChartOfAccounts = [
    { number: "1000", name: "Operating Bank Account", type: "Asset" },
    { number: "2000", name: "Accounts Payable", type: "Liability" },
    { number: "3000", name: "Owner Equity", type: "Equity" },
    { number: "4000", name: "Room Revenue", type: "Income" },
    { number: "5000", name: "Utilities Expense", type: "Expense" },
  ];

  const newChartOfAccounts = [
    { number: "1050", name: "Cash - Operating Bank", type: "Equity" },
    { number: "2050", name: "Trade Payables", type: "Liability" },
    { number: "3100", name: "Owner’s Capital", type: "Equity" },
    { number: "4100", name: "Guest Room Revenue", type: "Income" },
    { number: "5200", name: "Utilities", type: "Expense" },
  ];

  // Load and render the system prompt
  const promptService = new PromptService();
  const systemPrompt = await promptService.render("coa-mapping", {
    oldChartOfAccounts,
    newChartOfAccounts,
  });

  await logSection("System Prompt (compiled)");
  await log(systemPrompt);

  // JSON Schema for structured output
  const mappingJsonSchema = {
    type: "object",
    properties: {
      mapping: {
        type: "array",
        items: {
          type: "object",
          properties: {
            oldNumber: { type: "string" },
            oldName: { type: "string" },
            newNumber: { type: "string" },
            newName: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 3 },
            confidenceReasoning: { type: "string" },
          },
          required: [
            "oldNumber",
            "oldName",
            "confidence",
            "confidenceReasoning",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["mapping"],
    additionalProperties: false,
  } as const;

  // Enforce structured output via provider tooling
  const llmStructured = llm.withStructuredOutput(mappingJsonSchema);

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(
      "Perform the mapping now. Ensure confidence and reasoning are included for each row."
    ),
  ];

  const parsed = await llmStructured.invoke(messages);
  await logSection("Parsed Structured Output");
  await log(JSON.stringify(parsed, null, 2));
}
