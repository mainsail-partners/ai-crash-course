export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id?: string;
  name: string;
  args: unknown;
}

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface ThreadAggregate {
  threadId: string;
  agent: string;
  model: string;
  accountId: string;
  userId: string;
  systemPromptTemplate: string;
  systemPrompt: string;
  parameters: Record<string, unknown>;
  inputTokenCount: number;
  outputTokenCount: number;
  messages: ThreadMessage[];
  createdAt: Date;
  updatedAt: Date;
}


