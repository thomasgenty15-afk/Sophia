import { useCallback, useEffect, useMemo, useState } from 'react';

type InstallPlatform = 'android' | 'ios' | 'other';
type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

const detectInstallPlatform = (): InstallPlatform => {
  if (typeof window === 'undefined') return 'other';

  const nav = window.navigator;
  const ua = String(nav.userAgent || '').toLowerCase();
  const platform = String(nav.platform || '').toLowerCase();
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const isIpadOs = platform === 'macintel' && maxTouchPoints > 1;

  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || isIpadOs) return 'ios';
  return 'other';
};

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;

  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || iosStandalone;
};

export const useAppInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [didAcceptInstall, setDidAcceptInstall] = useState(false);

  const platform = useMemo(() => detectInstallPlatform(), []);
  const isMobileDevice = platform === 'android' || platform === 'ios';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncInstalledState = () => {
      setIsInstalled(isStandaloneMode());
    };

    syncInstalledState();

    const displayModeMedia = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = () => syncInstalledState();
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };
    const handleAppInstalled = () => {
      setDidAcceptInstall(true);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    displayModeMedia?.addEventListener?.('change', handleDisplayModeChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      displayModeMedia?.removeEventListener?.('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const canInstallDirectly = platform === 'android' && !!deferredPrompt && !isInstalled;

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    if (!deferredPrompt) return 'unavailable';

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      setDidAcceptInstall(true);
      return 'accepted';
    }

    return 'dismissed';
  }, [deferredPrompt]);

  return {
    platform,
    isMobileDevice,
    isInstalled,
    didAcceptInstall,
    canInstallDirectly,
    hasInstallPrompt: Boolean(deferredPrompt),
    promptInstall,
  };
};
