import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ThreadEntity } from '../threads/infra/postgres/thread.entity';
import { ThreadModel, ThreadSchema } from '../threads/infra/mongo/thread.schema';

@Module({
  imports: [
    ...(process.env.PERSISTENCE === 'postgres' ? [TypeOrmModule.forFeature([ThreadEntity])] : []),
    ...(process.env.PERSISTENCE === 'mongo'
      ? [MongooseModule.forFeature([{ name: ThreadModel.name, schema: ThreadSchema }])]
      : []),
  ],
  exports: [
    ...(process.env.PERSISTENCE === 'postgres' ? [TypeOrmModule] : []),
    ...(process.env.PERSISTENCE === 'mongo' ? [MongooseModule] : []),
  ],
})
export class ModelsModule {}


