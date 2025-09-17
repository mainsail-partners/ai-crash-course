import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThreadEntity } from './thread.entity';
import { CreateThreadInput, ThreadRepository } from '../../ports/thread.repository';
import { ThreadAggregate, ThreadMessage } from '../../domain/thread.domain';

@Injectable()
export class PgThreadRepository implements ThreadRepository {
  constructor(@InjectRepository(ThreadEntity) private readonly repo: Repository<ThreadEntity>) {}

  private toAggregate(row: ThreadEntity): ThreadAggregate {
    return {
      threadId: row.threadId,
      agent: row.agent,
      model: row.model,
      accountId: row.accountId,
      userId: row.userId,
      systemPromptTemplate: row.systemPromptTemplate,
      systemPrompt: row.systemPrompt,
      parameters: row.parameters ?? {},
      inputTokenCount: row.inputTokenCount ?? 0,
      outputTokenCount: row.outputTokenCount ?? 0,
      messages: (row.messages as ThreadMessage[]) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createThread(input: CreateThreadInput): Promise<ThreadAggregate> {
    const entity = this.repo.create({
      threadId: input.threadId,
      agent: input.agent,
      model: input.model,
      accountId: input.accountId,
      userId: input.userId,
      systemPromptTemplate: input.systemPromptTemplate,
      systemPrompt: input.systemPrompt,
      parameters: input.parameters,
      inputTokenCount: 0,
      outputTokenCount: 0,
      messages: input.seedMessages,
    });
    const saved = await this.repo.save(entity);
    return this.toAggregate(saved);
  }

  async getById(threadId: string): Promise<ThreadAggregate | null> {
    const row = await this.repo.findOne({ where: { threadId } });
    return row ? this.toAggregate(row) : null;
  }

  async listByAccount(accountId: string): Promise<ThreadAggregate[]> {
    const rows = await this.repo.find({ where: { accountId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.toAggregate(r));
  }

  async appendMessage(threadId: string, message: ThreadMessage): Promise<ThreadAggregate> {
    const row = await this.repo.findOneOrFail({ where: { threadId } });
    const messages = ([...(row.messages as ThreadMessage[] ?? [])] as ThreadMessage[]).concat(message);
    row.messages = messages as unknown[];
    await this.repo.save(row);
    return this.toAggregate(row);
  }

  async updateTokenCounts(threadId: string, inputDelta: number, outputDelta: number): Promise<void> {
    await this.repo.createQueryBuilder()
      .update(ThreadEntity)
      .set({
        inputTokenCount: () => `input_token_count + ${Math.max(0, inputDelta)}`,
        outputTokenCount: () => `output_token_count + ${Math.max(0, outputDelta)}`,
      } as any)
      .where('thread_id = :threadId', { threadId })
      .execute();
  }

  async delete(threadId: string): Promise<void> {
    await this.repo.delete({ threadId });
  }
}


