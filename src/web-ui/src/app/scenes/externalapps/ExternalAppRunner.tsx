import React, { useRef } from 'react';
import { useExternalAppBridge } from './hooks/useExternalAppBridge';

interface ExternalAppRunnerProps {
  url: string;
  appId: string;
  grantedCapabilities: Set<string>;
}

const ExternalAppRunner: React.FC<ExternalAppRunnerProps> = ({ url, appId, grantedCapabilities }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useExternalAppBridge(iframeRef, appId, grantedCapabilities);

  return (
    <iframe
      ref={iframeRef}
      src={url}
      data-app-id={appId}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={appId}
    />
  );
};

export default ExternalAppRunner;
