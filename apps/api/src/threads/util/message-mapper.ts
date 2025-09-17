import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ThreadMessage } from '../domain/thread.domain';

export function toLangChainMessages(messages: ThreadMessage[]): BaseMessage[] {
  const lc: BaseMessage[] = [];
  for (const m of messages) {
    switch (m.role) {
      case 'user':
        lc.push(new HumanMessage(m.content));
        break;
      case 'assistant':
        {
          const calls = m.toolCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            lc.push(new AIMessage({ content: m.content, tool_calls: calls as any }));
          } else {
            lc.push(new AIMessage(m.content));
          }
        }
        break;
      case 'tool':
        lc.push(new ToolMessage({ content: m.content, tool_call_id: m.toolCallId, name: m.name } as any));
        break;
      case 'system':
      default:
        lc.push(new SystemMessage(m.content));
        break;
    }
  }
  return lc;
}

export function fromAssistantToolCalls(toolCalls: { id?: string; name: string; args: unknown }[]): ThreadMessage[] {
  // Store assistant tool call requests as an assistant message with metadata for audit, if desired.
  // Typically, only tool result messages are appended; we expose this in case you want to log the request.
  const now = new Date();
  return [
    {
      id: `${now.getTime()}-assistant-tool-calls`,
      role: 'assistant',
      content: 'Tool calls requested',
      metadata: { toolCalls },
      createdAt: now,
    },
  ];
}

export function makeToolResultMessage(toolName: string, toolCallId: string | undefined, content: string): ThreadMessage {
  return {
    id: `${Date.now()}-${toolName}-result`,
    role: 'tool',
    name: toolName,
    toolCallId,
    content,
    createdAt: new Date(),
  };
}

export function makeAssistantToolCallMessage(
  toolCalls: { id?: string; name: string; args: unknown }[],
  content: string,
): ThreadMessage {
  return {
    id: `${Date.now()}-assistant-tool-calls`,
    role: 'assistant',
    content,
    toolCalls,
    createdAt: new Date(),
  };
}

export function makeAssistantMessage(content: string): ThreadMessage {
  return {
    id: `${Date.now()}-assistant`,
    role: 'assistant',
    content: String(content ?? ''),
    createdAt: new Date(),
  };
}


