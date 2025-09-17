import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ChatDto } from './dto/chat.dto';

@Controller('threads')
export class ThreadsController {
  constructor(private readonly service: ThreadsService) {}

  @Post()
  async create(@Body() dto: CreateThreadDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Get()
  async list(@Query('accountId') accountId = '1') {
    return this.service.list(accountId);
  }

  @Post(':id/chat')
  async chat(@Param('id') id: string, @Body() dto: ChatDto) {
    return this.service.chat(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { ok: true };
  }
}


