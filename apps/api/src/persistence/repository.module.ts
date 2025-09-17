import { Module } from '@nestjs/common';
import { ModelsModule } from './models.module';
import { THREAD_REPOSITORY } from '../threads/ports/thread.repository';
import { PgThreadRepository } from '../threads/infra/postgres/thread.repository.pg';
import { MongoThreadRepository } from '../threads/infra/mongo/thread.repository.mongo';

@Module({
  imports: [ModelsModule],
  providers: [
    {
      provide: THREAD_REPOSITORY,
      useClass: ((process.env.PERSISTENCE || 'postgres') === 'postgres')
        ? PgThreadRepository
        : MongoThreadRepository,
    },
  ],
  exports: [THREAD_REPOSITORY],
})
export class RepositoryModule {}


