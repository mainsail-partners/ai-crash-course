import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersistenceModule } from './persistence/persistence.module';
import { ModelsModule } from './persistence/models.module';
import { RepositoryModule } from './persistence/repository.module';
import { ThreadsModule } from './threads/threads.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().default(3000),
        PERSISTENCE: Joi.string().valid('postgres', 'mongo').required(),
        POSTGRES_URL: Joi.string().uri().when('PERSISTENCE', { is: 'postgres', then: Joi.required() }),
        MONGO_URL: Joi.string().uri().when('PERSISTENCE', { is: 'mongo', then: Joi.required() }),
        LLM_PROVIDER: Joi.string().valid('openai', 'claude', 'gemini', 'grok').default('openai'),
        LLM_MODEL: Joi.string().default('gpt-5-mini'),
        OPENAI_API_KEY: Joi.string().allow('').optional(),
        ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
        GOOGLE_API_KEY: Joi.string().allow('').optional(),
        XAI_API_KEY: Joi.string().allow('').optional(),
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.POSTGRES_URL,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    MongooseModule.forRoot(process.env.MONGO_URL || ''),
    PersistenceModule,
    ModelsModule,
    RepositoryModule,
    ThreadsModule,
    KnowledgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
