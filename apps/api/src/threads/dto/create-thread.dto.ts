import { IsOptional, IsString, IsObject } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  agent!: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  userMessage?: string;
}


