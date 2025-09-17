import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateThreadInput, ThreadRepository } from '../../ports/thread.repository';
import { ThreadAggregate, ThreadMessage } from '../../domain/thread.domain';
import { ThreadDocument, ThreadModel } from './thread.schema';

@Injectable()
export class MongoThreadRepository implements ThreadRepository {
  constructor(@InjectModel(ThreadModel.name) private readonly model: Model<ThreadDocument>) {}

  private toAggregate(doc: ThreadDocument | (ThreadModel & Record<string, unknown>)): ThreadAggregate {
    const plain: any = typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : doc;
    return {
      threadId: plain.threadId,
      agent: plain.agent,
      model: plain.model,
      accountId: plain.accountId,
      userId: plain.userId,
      systemPromptTemplate: plain.systemPromptTemplate,
      systemPrompt: plain.systemPrompt,
      parameters: plain.parameters ?? {},
      inputTokenCount: plain.inputTokenCount ?? 0,
      outputTokenCount: plain.outputTokenCount ?? 0,
      messages: (plain.messages as ThreadMessage[]) ?? [],
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  }

  async createThread(input: CreateThreadInput): Promise<ThreadAggregate> {
    const created = await this.model.create({
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
    return this.toAggregate(created.toObject());
  }

  async getById(threadId: string): Promise<ThreadAggregate | null> {
    const doc = await this.model.findOne({ threadId }).lean().exec();
    return doc ? this.toAggregate(doc as any) : null;
  }

  async listByAccount(accountId: string): Promise<ThreadAggregate[]> {
    const docs = await this.model.find({ accountId }).sort({ createdAt: -1 }).lean().exec();
    return (docs as any[]).map((d) => this.toAggregate(d as any));
  }

  async appendMessage(threadId: string, message: ThreadMessage): Promise<ThreadAggregate> {
    const doc = await this.model.findOneAndUpdate(
      { threadId },
      { $push: { messages: message } },
      { new: true, lean: true } as any
    ).lean().exec();
    if (!doc) throw new Error('Thread not found');
    return this.toAggregate(doc as any);
  }

  async updateTokenCounts(threadId: string, inputDelta: number, outputDelta: number): Promise<void> {
    await this.model.updateOne(
      { threadId },
      {
        $inc: {
          inputTokenCount: Math.max(0, inputDelta),
          outputTokenCount: Math.max(0, outputDelta),
        },
      }
    ).exec();
  }

  async delete(threadId: string): Promise<void> {
    await this.model.deleteOne({ threadId }).exec();
  }
}


