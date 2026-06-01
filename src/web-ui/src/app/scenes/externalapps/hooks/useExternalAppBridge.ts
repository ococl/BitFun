import { useLayoutEffect, useRef, RefObject } from 'react';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import { miniAppAPI } from '@/infrastructure/api/service-api/MiniAppAPI';
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

const ALLOWED_METHODS = new Set([
  'storage.get', 'storage.set',
  'ai.complete', 'ai.chat', 'ai.cancel', 'ai.getModels',
  'dialog.open', 'dialog.save', 'dialog.message',
  'clipboard.writeText', 'clipboard.readText',
  'bitfun/request-theme', 'bitfun/request-locale',
]);

export function useExternalAppBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  appId: string,
  grantedCapabilities: Set<string>,
) {
  const { theme: currentTheme } = useTheme();
  const { currentLanguage } = useI18n();
  const themeRef = useRef(currentTheme);
  themeRef.current = currentTheme;
  const localeRef = useRef(currentLanguage);
  localeRef.current = currentLanguage;
  const grantedRef = useRef(grantedCapabilities);
  grantedRef.current = grantedCapabilities;
  const cacheState = useExternalAppStore((s) => s.cacheState);

  useLayoutEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data as JSONRPCRequest;
      if (!msg?.method) return;

      const { id, method, params = {} } = msg;
      const reply = (result: unknown) =>
        iframeRef.current?.contentWindow?.postMessage({ jsonrpc: '2.0', id, result }, '*');
      const replyError = (message: string) =>
        iframeRef.current?.contentWindow?.postMessage(
          { jsonrpc: '2.0', id, error: { code: -32000, message } }, '*');

      const ns = method.split('.')[0];
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
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'bitfun:event', event: 'localeChange', payload: { locale: localeRef.current } }, '*');
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
            const result = await miniAppAPI.aiComplete(appId, String(params.prompt ?? ''), {
              systemPrompt: params.systemPrompt as string | undefined,
              model: params.model as string | undefined,
              maxTokens: params.maxTokens as number | undefined,
              temperature: params.temperature as number | undefined,
            });
            reply(result);
            return;
          }
          case 'ai.chat': {
            const result = await miniAppAPI.aiChat(
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
            await miniAppAPI.aiCancel(appId, String(params.streamId ?? ''));
            reply(null);
            return;
          }
          case 'ai.getModels': {
            const models = await miniAppAPI.aiListModels(appId);
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
            const ok = await dialogMessage(params as unknown as Parameters<typeof dialogMessage>[0]);
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

  useLayoutEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'bitfun:event', event: 'themeChange', payload: { theme: currentTheme } }, '*');
  }, [currentTheme, iframeRef]);
}
