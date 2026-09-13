import React from 'react';
import { createRoot } from 'react-dom/client';
import { getNammuSDK } from '@nammu/sdk';
import BrowserApp from './browser/BrowserApp';
import { initializeBrowserStorage } from './host/storage';
import './styles.css';

async function start() {
  const sdk = getNammuSDK();
  document.documentElement.dataset.theme = 'horizon';
  await initializeBrowserStorage(sdk);
  createRoot(document.getElementById('root')!).render(<BrowserApp />);
  await sdk.ready();
}

void start();
