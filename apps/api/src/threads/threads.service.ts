import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { THREAD_REPOSITORY, type ThreadRepository } from './ports/thread.repository';
import { ThreadAggregate, ThreadMessage } from './domain/thread.domain';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ChatDto } from './dto/chat.dto';
import { PromptService } from '../services/prompt.service';
import { HumanMessage, SystemMessage, ToolMessage, AIMessage } from '@langchain/core/messages';
import { toLangChainMessages, makeToolResultMessage, makeAssistantToolCallMessage, makeAssistantMessage } from './util/message-mapper';
import { AgentToolsService } from '../services/agent-tools.service';
import { ProviderService } from '../services/provider.service';
import type { Provider } from '../services/provider.service';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool } from '@langchain/core/tools';
import type { Runnable } from '@langchain/core/runnables';

type BoundTool = ReturnType<typeof tool>;
type ToolCapable = BaseChatModel & { bindTools: (tools: BoundTool[], kwargs?: unknown) => BaseChatModel };
type ChatRunnable = Runnable<(SystemMessage | HumanMessage | AIMessage | ToolMessage)[], AIMessage>;

@Injectable()
export class ThreadsService {
  constructor(
    @Inject(THREAD_REPOSITORY) private readonly repo: ThreadRepository,
    private readonly prompts: PromptService,
    private readonly providers: ProviderService,
    private readonly agentTools: AgentToolsService,
  ) {}

  // Type guard method to check if the message has tool calls
  private hasToolCalls(msg: AIMessage): msg is AIMessage & { tool_calls: { id?: string; name?: string; args?: unknown }[] } {
    return Array.isArray((msg as any).tool_calls);
  }

  async create(dto: CreateThreadDto): Promise<ThreadAggregate> {
    const parameters = dto.parameters ?? {};
    const { template: systemPromptTemplate, rendered: systemPrompt } = await this.prompts.render(dto.agent, parameters);
    const threadId = randomUUID();
    const now = new Date();
    const seedMessages: ThreadMessage[] = [
      { id: randomUUID(), role: 'system', content: systemPrompt, createdAt: now },
    ];
    return this.repo.createThread({
      threadId,
      agent: dto.agent,
      model: dto.model ?? process.env.DEFAULT_MODEL ?? 'gpt-4o-mini',
      accountId: '1',
      userId: randomUUID(),
      systemPromptTemplate,
      systemPrompt,
      parameters,
      seedMessages,
    });
  }

  async get(threadId: string): Promise<ThreadAggregate | null> {
    return this.repo.getById(threadId);
  }

  async list(accountId: string): Promise<ThreadAggregate[]> {
    return this.repo.listByAccount(accountId);
  }

  async chat(threadId: string, dto: ChatDto): Promise<ThreadMessage> {
    // High-level flow of a chat turn:
    // 1) Load the persisted thread (single source of truth) and guard if not found.
    // 2) Persist the user's message to the thread. We always write first so every turn is captured.
    // 3) Convert the full thread (system + messages) into LangChain messages.
    // 4) Resolve the agent's tools and bind them to the model for this turn.
    // 5) Invoke the model once. If the assistant returns tool_calls, execute them locally.
    // 6) Append tool results as ToolMessages, then invoke the model again to get a final, user-visible answer.
    // 7) Append the assistant's final answer to the thread and return the updated thread aggregate.

    const thread = await this.repo.getById(threadId);
    if (!thread) throw new Error('Thread not found');

    // Persist the user's input on the thread before calling the model.
    const userMsg: ThreadMessage = { id: randomUUID(), role: 'user', content: dto.message, metadata: dto.metadata, createdAt: new Date() };

    // Add the user message to the thread
    const afterUser = await this.repo.appendMessage(threadId, userMsg);

    // Convert the entire conversation to LangChain message objects.
    // We include the system prompt first, then all prior messages (now including the new user message).
    const lcMessages = toLangChainMessages(afterUser.messages);

    // Resolve the agent's tool set, then build a provider-specific model
    // and bind tools (if any). bindTools returns a Runnable that we can invoke.
    const boundTools = await this.agentTools.load(thread.agent);
    const provider = ((process.env.LLM_PROVIDER || 'openai') as Provider);
    const base = this.providers.buildModel(provider);
    const model = (boundTools.length > 0 ? (base as ToolCapable).bindTools(boundTools) : base) as ChatRunnable;

    // First model call: the assistant can either respond directly or request tool_calls.
    const resp: AIMessage = await model.invoke(lcMessages);

    // If tool_calls are present, persist the assistant tool-calls message, execute tools, then ask the model again.
    const toolCalls = this.hasToolCalls(resp) ? resp.tool_calls : [];
    if (toolCalls.length > 0) {
      // Persist the assistant tool_calls message immediately so ordering is correct: user -> assistant(tool_calls) -> tool results
      const assistantToolCallMsg = makeAssistantToolCallMessage(toolCalls, String(resp.content ?? ''));
      await this.repo.appendMessage(threadId, assistantToolCallMsg);

      for (const tc of toolCalls) {
        // Locate the matching tool by name and execute with the provided args.
        const entry = boundTools.find((t) => t.name === tc.name);
        if (!entry) continue;
        const toolResult = await entry.invoke(tc.args);
        await this.repo.appendMessage(threadId, makeToolResultMessage(tc.name, tc.id, JSON.stringify(toolResult)));
      }

      // Rebuild from persisted state to ensure the second invoke includes assistant(tool_calls) and tool results
      const updatedAfterTools = await this.repo.getById(threadId);
      const followUp: AIMessage = await model.invoke(toLangChainMessages(updatedAfterTools!.messages));

      // Persist the assistant's final response for this turn.
      const assistantMsg = makeAssistantMessage(String(followUp.content ?? ''));
      await this.repo.appendMessage(threadId, assistantMsg);
      return assistantMsg;
    }

    // No tools requested: persist the assistant's direct response and return.
    const assistantMsg = makeAssistantMessage(String(resp.content ?? ''));
    await this.repo.appendMessage(threadId, assistantMsg);
    return assistantMsg;
  }

  async delete(threadId: string): Promise<void> {
    return this.repo.delete(threadId);
  }
}


