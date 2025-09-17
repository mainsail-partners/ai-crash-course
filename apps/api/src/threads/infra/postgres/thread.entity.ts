import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('threads')
export class ThreadEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  threadId!: string;

  @Column({ type: 'varchar', length: 128 })
  agent!: string;

  @Column({ type: 'varchar', length: 128 })
  model!: string;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'text' })
  systemPromptTemplate!: string;

  @Column({ type: 'text' })
  systemPrompt!: string;

  @Column({ type: 'jsonb', default: {} })
  parameters!: Record<string, unknown>;

  @Column({ type: 'integer', default: 0 })
  inputTokenCount!: number;

  @Column({ type: 'integer', default: 0 })
  outputTokenCount!: number;

  @Column({ type: 'jsonb', default: [] })
  messages!: unknown[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}


