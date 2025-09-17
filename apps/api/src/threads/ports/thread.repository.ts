import { ThreadAggregate, ThreadMessage } from '../domain/thread.domain';

export const THREAD_REPOSITORY = Symbol('THREAD_REPOSITORY');

export interface CreateThreadInput {
  threadId: string;
  agent: string;
  model: string;
  accountId: string;
  userId: string;
  systemPromptTemplate: string;
  systemPrompt: string;
  parameters: Record<string, unknown>;
  seedMessages: ThreadMessage[];
}

export interface ThreadRepository {
  createThread(input: CreateThreadInput): Promise<ThreadAggregate>;
  getById(threadId: string): Promise<ThreadAggregate | null>;
  listByAccount(accountId: string): Promise<ThreadAggregate[]>;
  appendMessage(threadId: string, message: ThreadMessage): Promise<ThreadAggregate>;
  updateTokenCounts(threadId: string, inputDelta: number, outputDelta: number): Promise<void>;
  delete(threadId: string): Promise<void>;
}


