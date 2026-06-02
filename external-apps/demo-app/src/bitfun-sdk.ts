/**
 * BitFun SDK — 简易 postMessage JSON-RPC 桥接封装
 *
 * 供外部应用嵌入 BitFun 宿主时使用。
 */

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface EventMessage {
  type: 'bitfun:event';
  event: string;
  payload: unknown;
}

let idCounter = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const listeners = new Map<string, Set<(payload: unknown) => void>>();
const toolHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>();

function isFromParent(event: MessageEvent): boolean {
  return event.source === window.parent;
}

window.addEventListener('message', async (event: MessageEvent) => {
  if (!isFromParent(event)) return;
  const msg = event.data as JSONRPCResponse | EventMessage | JSONRPCRequest;

  // Handle incoming tool.call requests from parent
  if ('jsonrpc' in msg && 'method' in msg && msg.method === 'tool.call') {
    const req = msg as JSONRPCRequest;
    const params = req.params as { callId: string; command: string; params: unknown } | undefined;
    const command = params?.command ?? '';
    const handler = toolHandlers.get(command);

    const reply = (result: unknown) => {
      window.parent.postMessage({ jsonrpc: '2.0', id: req.id, result }, '*');
    };
    const replyError = (message: string) => {
      window.parent.postMessage({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message } }, '*');
    };

    if (!handler) {
      replyError(`No handler registered for command: ${command}`);
      return;
    }

    try {
      const result = await handler(params?.params);
      reply({ success: true, data: result });
    } catch (err) {
      replyError(String(err));
    }
    return;
  }

  if ('jsonrpc' in msg && typeof msg.id === 'number') {
    const resp = msg as JSONRPCResponse;
    const p = pending.get(resp.id);
    if (!p) return;
    pending.delete(resp.id);
    if (resp.error) {
      p.reject(new Error(resp.error.message));
    } else {
      p.resolve(resp.result);
    }
    return;
  }

  if ('type' in msg && msg.type === 'bitfun:event') {
    emit(msg.event, msg.payload);
  }
});

function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((fn) => fn(payload));
}

function call(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++idCounter;
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params } as JSONRPCRequest, '*');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`SDK timeout: ${method}`));
      }
    }, 30000);
  });
}

export type ModelCategory = 'general_chat' | 'multimodal';
export type ModelCapability = 'text_chat' | 'function_calling';
export type ReasoningMode = 'default' | 'enabled' | 'disabled' | 'adaptive';
export type AuthConfig =
  | { type: 'api_key' }
  | { type: 'codex_cli' }
  | { type: 'gemini_cli' };

export interface AiModelInfo {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  baseUrl: string;
  requestUrl?: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  enabled: boolean;
  category: ModelCategory;
  capabilities: ModelCapability[];
  recommendedFor: string[];
  metadata?: Record<string, unknown>;
  reasoningMode?: ReasoningMode;
  inlineThinkInText: boolean;
  customHeaders?: Record<string, string>;
  customHeadersMode?: string;
  skipSslVerify: boolean;
  reasoningEffort?: string;
  thinkingBudgetTokens?: number;
  customRequestBody?: string;
  customRequestBodyMode?: string;
  auth?: AuthConfig;
}

export interface AiOptions {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const bitfun = {
  storage: {
    get: (key: string): Promise<unknown> => call('storage.get', { key }),
    set: (key: string, value: unknown): Promise<unknown> => call('storage.set', { key, value }),
  },

  ai: {
    complete: (prompt: string, options?: AiOptions): Promise<unknown> =>
      call('ai.complete', { prompt, ...options }),
    chat: (messages: Message[], streamId: string, options?: AiOptions): Promise<unknown> =>
      call('ai.chat', { messages, streamId, ...options }),
    cancel: (streamId: string): Promise<unknown> => call('ai.cancel', { streamId }),
    getModels: (): Promise<AiModelInfo[]> => call('ai.getModels') as Promise<AiModelInfo[]>,
  },

  dialog: {
    open: (options?: Record<string, unknown>): Promise<unknown> =>
      call('dialog.open', options || {}),
    save: (options?: Record<string, unknown>): Promise<unknown> =>
      call('dialog.save', options || {}),
    message: (options?: Record<string, unknown>): Promise<unknown> =>
      call('dialog.message', options || {}),
  },

  clipboard: {
    writeText: (text: string): Promise<unknown> => call('clipboard.writeText', { text }),
    readText: (): Promise<unknown> => call('clipboard.readText'),
  },

  requestTheme: (): Promise<unknown> => call('bitfun/request-theme'),
  requestLocale: (): Promise<unknown> => call('bitfun/request-locale'),

  reportState: (state: Record<string, unknown>): void => {
    window.parent.postMessage({ type: 'bitfun:state', state }, '*');
  },

  tools: {
    registerHandler: (command: string, handler: (params: unknown) => Promise<unknown> | unknown): (() => void) => {
      toolHandlers.set(command, handler);
      return () => toolHandlers.delete(command);
    },
    unregisterHandler: (command: string): void => {
      toolHandlers.delete(command);
    },
  },

  on: (event: string, handler: (payload: unknown) => void): (() => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  off: (event: string, handler: (payload: unknown) => void): void => {
    listeners.get(event)?.delete(handler);
  },
};
