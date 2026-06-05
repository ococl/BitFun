import { useLayoutEffect, useRef, RefObject, useCallback, useEffect } from 'react';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import { api } from '@/infrastructure/api/service-api/ApiClient';
import { open as dialogOpen, save as dialogSave, message as dialogMessage } from '@tauri-apps/plugin-dialog';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { useI18n } from '@/infrastructure/i18n';
import { useExternalAppStore } from '../stores/externalAppStore';

interface JSONRPCRequest {
  jsonrpc?: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

const ALLOWED_METHODS = new Set([
  'storage.get', 'storage.set',
  'ai.complete', 'ai.chat', 'ai.cancel', 'ai.getModels',
  'dialog.open', 'dialog.save', 'dialog.message',
  'clipboard.writeText', 'clipboard.readText',
  'notification.send',
  'bitfun/request-theme', 'bitfun/request-locale',
]);

export function useExternalAppBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  appId: string,
  grantedCapabilities: Set<string>,
) {
  const { themeType } = useTheme();
  const { currentLanguage } = useI18n();
  const themeRef = useRef(themeType);
  themeRef.current = themeType;
  const localeRef = useRef(currentLanguage);
  localeRef.current = currentLanguage;
  const grantedRef = useRef(grantedCapabilities);
  grantedRef.current = grantedCapabilities;
  const cacheState = useExternalAppStore((s) => s.cacheState);

  // Pending tool calls from Rust -> iframe (waiting for iframe response)
  const pendingToolCallsRef = useRef<Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>>(new Map());

  const notifyTheme = useCallback((theme: string, win?: Window) => {
    const target = win ?? iframeRef.current?.contentWindow;
    target?.postMessage(
      { type: 'bitfun:event', event: 'themeChange', payload: { theme } }, '*');
  }, [iframeRef]);

  const notifyLocale = useCallback((locale: string, win?: Window) => {
    const target = win ?? iframeRef.current?.contentWindow;
    target?.postMessage(
      { type: 'bitfun:event', event: 'localeChange', payload: { locale } }, '*');
  }, [iframeRef]);

  useLayoutEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      // Handle JSON-RPC responses (e.g. tool.call results from iframe)
      const response = event.data as JSONRPCResponse;
      if ('jsonrpc' in response && (response.result !== undefined || response.error !== undefined)) {
        const callId = String(response.id);
        const pending = pendingToolCallsRef.current.get(callId);
        if (pending) {
          pendingToolCallsRef.current.delete(callId);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
        return;
      }

      const msg = event.data as JSONRPCRequest;
      if (!msg?.method) return;

      const { id, method, params = {} } = msg;
      const reply = (result: unknown) =>
        iframeRef.current?.contentWindow?.postMessage({ jsonrpc: '2.0', id, result }, '*');
      const replyError = (message: string) =>
        iframeRef.current?.contentWindow?.postMessage(
          { jsonrpc: '2.0', id, error: { code: -32000, message } }, '*');

      const ns = method.split(/[./]/)[0];
      if (ns !== 'bitfun' && !grantedRef.current.has(ns)) {
        replyError(`capability not granted: ${ns}`);
        return;
      }
      if (!ALLOWED_METHODS.has(method)) {
        replyError(`method not allowed: ${method}`);
        return;
      }

      if (method === 'bitfun/request-theme') {
        reply({ theme: themeRef.current });
        return;
      }
      if (method === 'bitfun/request-locale') {
        reply({ locale: localeRef.current });
        return;
      }

      try {
        switch (method) {
          case 'storage.get': {
            const value = await externalAppAPI.getStorage(appId, String(params.key ?? ''));
            reply(value);
            return;
          }
          case 'storage.set': {
            await externalAppAPI.setStorage(appId, String(params.key ?? ''), params.value);
            reply(null);
            return;
          }
          case 'ai.complete': {
            const result = await externalAppAPI.aiComplete(appId, String(params.prompt ?? ''), {
              systemPrompt: params.systemPrompt as string | undefined,
              model: params.model as string | undefined,
              maxTokens: params.maxTokens as number | undefined,
              temperature: params.temperature as number | undefined,
            });
            reply(result);
            return;
          }
          case 'ai.chat': {
            const result = await externalAppAPI.aiChat(
              appId,
              (params.messages as { role: 'user' | 'assistant'; content: string }[]) ?? [],
              String(params.streamId ?? ''),
              {
                systemPrompt: params.systemPrompt as string | undefined,
                model: params.model as string | undefined,
                maxTokens: params.maxTokens as number | undefined,
                temperature: params.temperature as number | undefined,
              },
            );
            reply(result);
            return;
          }
          case 'ai.cancel': {
            await externalAppAPI.aiCancel(appId, String(params.streamId ?? ''));
            reply(null);
            return;
          }
          case 'ai.getModels': {
            const models = await externalAppAPI.aiListModels(appId);
            reply(models);
            return;
          }
          case 'dialog.open': {
            const path = await dialogOpen(params as Parameters<typeof dialogOpen>[0]);
            reply(path);
            return;
          }
          case 'dialog.save': {
            const path = await dialogSave(params as Parameters<typeof dialogSave>[0]);
            reply(path);
            return;
          }
          case 'dialog.message': {
            const msgParams = params as Record<string, unknown>;
            const msgText = String(msgParams.message ?? '');
            const msgTitle = msgParams.title ? String(msgParams.title) : undefined;
            const ok = await dialogMessage(msgText, msgTitle ? { title: msgTitle } : undefined);
            reply(ok);
            return;
          }
          case 'clipboard.writeText': {
            await navigator.clipboard.writeText(String(params.text ?? ''));
            reply(null);
            return;
          }
          case 'clipboard.readText': {
            const text = await navigator.clipboard.readText();
            reply(text);
            return;
          }
          case 'notification.send': {
            await api.invoke('send_external_app_notification', {
              request: {
                app_id: appId,
                title: String(params.title ?? ''),
                body: params.body ? String(params.body) : undefined,
              },
            });
            reply(null);
            return;
          }
          default:
            replyError(`unhandled method: ${method}`);
        }
      } catch (err) {
        replyError(String(err));
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [appId, iframeRef, cacheState]);

  // Poll for external app tool calls from Rust backend and forward to iframe
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const req = await externalAppAPI.pollToolCall(appId);
          if (req && !cancelled) {
            const win = iframeRef.current?.contentWindow;
            if (win) {
              const id = `tool-${Date.now()}-${Math.random()}`;
              const promise = new Promise<unknown>((resolve, reject) => {
                pendingToolCallsRef.current.set(id, { resolve, reject });
              });

              win.postMessage(
                {
                  jsonrpc: '2.0',
                  id,
                  method: 'tool.call',
                  params: {
                    callId: req.callId,
                    command: req.command,
                    params: req.params,
                  },
                },
                '*',
              );

              // Wait for iframe response with 25s timeout
              const timeoutMs = 25000;
              const result = await Promise.race([
                promise,
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('iframe tool call timeout')), timeoutMs),
                ),
              ]).catch((err) => ({ success: false, error: String(err) }));

              pendingToolCallsRef.current.delete(id);

              const r = result as { success?: boolean; data?: unknown; error?: string };
              await externalAppAPI.submitToolResult(
                req.callId,
                r.success ?? false,
                r.data,
                r.error,
              );
            } else {
              // iframe not ready, reject the tool call
              await externalAppAPI.submitToolResult(
                req.callId,
                false,
                undefined,
                'External app iframe not ready',
              );
            }
          }
        } catch (err) {
          // ignore polling errors
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [appId, iframeRef]);

  useLayoutEffect(() => {
    notifyTheme(themeType);
  }, [themeType, notifyTheme]);

  useLayoutEffect(() => {
    notifyLocale(currentLanguage);
  }, [currentLanguage, notifyLocale]);

  return { notifyTheme, notifyLocale };
}
