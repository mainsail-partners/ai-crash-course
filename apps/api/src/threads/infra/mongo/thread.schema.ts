import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ThreadDocument = HydratedDocument<ThreadModel>;

@Schema({ _id: false })
export class ToolCallModel {
  @Prop()
  id?: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: Object })
  args?: unknown;
}

export const ToolCallSchema = SchemaFactory.createForClass(ToolCallModel);

@Schema({ _id: false })
export class MessageModel {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true, enum: ['system', 'user', 'assistant', 'tool'] })
  role!: string;

  @Prop({ required: true })
  content!: string;

  @Prop()
  name?: string;

  @Prop()
  toolCallId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: [ToolCallSchema], required: false, default: undefined })
  toolCalls?: ToolCallModel[];

  @Prop({ required: true })
  createdAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageModel);

@Schema({ collection: 'threads', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class ThreadModel {
  @Prop({ required: true, unique: true })
  threadId!: string;

  @Prop({ required: true })
  agent!: string;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  accountId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  systemPromptTemplate!: string;

  @Prop({ required: true })
  systemPrompt!: string;

  @Prop({ type: Object, default: {} })
  parameters!: Record<string, unknown>;

  @Prop({ default: 0 })
  inputTokenCount!: number;

  @Prop({ default: 0 })
  outputTokenCount!: number;

  @Prop({ type: [MessageSchema], default: [] })
  messages!: MessageModel[];

  @Prop()
  createdAt!: Date;

  @Prop()
  updatedAt!: Date;
}

export const ThreadSchema = SchemaFactory.createForClass(ThreadModel);


