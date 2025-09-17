import { Module } from '@nestjs/common';
import { THREAD_REPOSITORY } from './ports/thread.repository';
import { ThreadsService } from './threads.service';
import { ThreadsController } from './threads.controller';
import { PromptService } from '../services/prompt.service';
import { ProviderService } from '../services/provider.service';
import { AgentToolsService } from '../services/agent-tools.service';
import { RepositoryModule } from '../persistence/repository.module';

@Module({
  imports: [RepositoryModule],
  controllers: [ThreadsController],
  providers: [
    ThreadsService,
    PromptService,
    ProviderService,
    AgentToolsService,
  ],
})
export class ThreadsModule {}


