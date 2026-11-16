import React from 'react';
import { createRoot } from 'react-dom/client';
import { getNammuSDK } from '@nammu/sdk';
import BrowserApp from './browser/BrowserApp';
import { initializeBrowserStorage } from './host/storage';
import './styles.css';

async function start() {
  const sdk = getNammuSDK();
  const pendingNavigationUrls: string[] = [];
  const shellWindow = window as Window & {
    __NAMMU_BROWSER_READY__?: boolean;
    __NAMMU_PENDING_BROWSER_URLS__?: string[];
  };
  shellWindow.__NAMMU_BROWSER_READY__ = false;
  shellWindow.__NAMMU_PENDING_BROWSER_URLS__ = pendingNavigationUrls;
  sdk.events.on('app.os.nammu.browser.navigation.open-url', (payload: { url?: unknown }) => {
    if (typeof payload?.url !== 'string') return;
    try {
      const url = new URL(payload.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (shellWindow.__NAMMU_BROWSER_READY__) {
        window.dispatchEvent(new CustomEvent('nammu-browser-open-url', { detail: { url: url.toString() } }));
      } else {
        pendingNavigationUrls.push(url.toString());
      }
    } catch {
      // Invalid host navigation requests are ignored.
    }
  });
  document.documentElement.dataset.theme = 'horizon';
  await initializeBrowserStorage(sdk);
  createRoot(document.getElementById('root')!).render(<BrowserApp />);
  await sdk.ready();
}

void start();
