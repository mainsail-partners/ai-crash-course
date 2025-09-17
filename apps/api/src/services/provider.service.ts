import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatXAI } from '@langchain/xai';
import { Injectable } from '@nestjs/common';

export type Provider = 'openai' | 'claude' | 'gemini' | 'grok';

export type BuildModelOptions = {
  model?: string;
  streaming?: boolean;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;
  maxRetries?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
};

@Injectable()
export class ProviderService {
  buildModel(provider: Provider, options: BuildModelOptions = {}): BaseChatModel {
    const {
      model,
      streaming,
      temperature,
      topP,
      frequencyPenalty,
      presencePenalty,
      timeout,
      maxRetries,
      reasoningEffort,
    } = options;

    switch (provider) {
      case 'openai':
        return new ChatOpenAI({
          model: model || process.env.LLM_MODEL || 'gpt-5-mini',
          streaming,
          temperature,
          topP,
          frequencyPenalty,
          presencePenalty,
          timeout,
          maxRetries: maxRetries ?? 0,
          reasoningEffort: reasoningEffort || 'low',
        });
      case 'claude':
        return new ChatAnthropic({
          model: model || process.env.LLM_MODEL || 'claude-3-5-sonnet-latest',
          temperature,
          maxRetries,
        }) as unknown as BaseChatModel;
      case 'gemini':
        return new ChatGoogleGenerativeAI({
          model: model || process.env.LLM_MODEL || 'gemini-2.5-pro',
          temperature,
        }) as unknown as BaseChatModel;
      case 'grok':
        return new ChatXAI({
          model: model || process.env.LLM_MODEL || 'grok-4-latest',
          temperature,
        } as any) as unknown as BaseChatModel;
    }
  }
}


