// Thin, safe access to Capacitor. Everything degrades to a no-op in a normal browser,
// so the same code runs in `vite dev`, in tests and inside the Android app.

import { Capacitor } from '@capacitor/core';

export function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/** Register the Android hardware back button. handler() returns true if it consumed the press. */
export async function registerBackButton(handler) {
  if (!isNative()) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      const consumed = handler();
      if (!consumed) App.exitApp();
    });
  } catch {
    /* plugin missing: ignore */
  }
}

export async function hideSplash() {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}

/** Match the Android status bar to the current theme. */
export async function setStatusBar({ dark, color }) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color });
  } catch {
    /* ignore */
  }
}
