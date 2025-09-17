import { IsOptional, IsString, IsObject } from 'class-validator';

export class ChatDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}


