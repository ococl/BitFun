import { isTauriRuntime } from '@/infrastructure/runtime';
import { useThemeStore } from '@/infrastructure/theme/store/themeStore';
import { useI18nStore } from '@/infrastructure/i18n/store/i18nStore';

/**
 * 全局跟踪已打开的外部应用新窗口（Webview label）。
 * 在 App 级别通过 zustand subscribe 监听 theme/locale 变化并广播，
 * 避免页面卸载后监听失效。
 */
export const openedExternalAppWindowLabels = new Set<string>();

let syncInitialized = false;

export function initExternalAppWindowSync(): void {
  if (syncInitialized) return;
  syncInitialized = true;

  if (!isTauriRuntime()) return;

  let prevTheme: string | undefined;
  let prevLocale: string | undefined;

  // Subscribe to theme changes
  useThemeStore.subscribe((state) => {
    const themeType = state.currentTheme?.type;
    if (themeType === prevTheme) return;
    prevTheme = themeType;
    const theme = themeType || 'dark';
    const labels = Array.from(openedExternalAppWindowLabels);
    if (labels.length === 0) return;
    void Promise.all(
      labels.map((label) =>
        import('@tauri-apps/api/event')
          .then(({ emitTo }) => emitTo(label, 'bitfun:theme-change', { theme }))
          .catch(() => {})
      )
    );
  });

  // Subscribe to locale changes
  useI18nStore.subscribe((state) => {
    const locale = state.currentLanguage;
    if (locale === prevLocale) return;
    prevLocale = locale;
    const labels = Array.from(openedExternalAppWindowLabels);
    if (labels.length === 0) return;
    void Promise.all(
      labels.map((label) =>
        import('@tauri-apps/api/event')
          .then(({ emitTo }) => emitTo(label, 'bitfun:locale-change', { locale }))
          .catch(() => {})
      )
    );
  });
}
