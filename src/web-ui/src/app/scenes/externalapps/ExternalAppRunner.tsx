import React, { useRef, useCallback } from 'react';
import { useExternalAppBridge } from './hooks/useExternalAppBridge';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { useI18n } from '@/infrastructure/i18n';

interface ExternalAppRunnerProps {
  url: string;
  appId: string;
  grantedCapabilities: Set<string>;
}

const ExternalAppRunner: React.FC<ExternalAppRunnerProps> = ({ url, appId, grantedCapabilities }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { notifyTheme, notifyLocale } = useExternalAppBridge(iframeRef, appId, grantedCapabilities);
  const { themeType } = useTheme();
  const { currentLanguage } = useI18n();

  const handleLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    // Re-send initial theme/locale after iframe finishes loading so the child app can catch up
    notifyTheme(themeType, win);
    notifyLocale(currentLanguage, win);
  }, [notifyTheme, notifyLocale, themeType, currentLanguage]);

  return (
    <iframe
      ref={iframeRef}
      src={url}
      data-app-id={appId}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={appId}
      onLoad={handleLoad}
    />
  );
};

export default ExternalAppRunner;
