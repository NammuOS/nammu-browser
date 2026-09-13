import type { NammuApp } from '@nammu/sdk';

const LEGACY_KEYS = [
  'nammu_browser_bookmarks',
  'nammu_browser_history',
  'nammu_browser_preferences',
  'nammu_browser_new_tab_workspace_v1',
] as const;

const values = new Map<string, string>();
let sdk: NammuApp | null = null;

export const browserStorage = Object.freeze({
  getItem(key: string): string | null {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    const normalized = String(value);
    values.set(key, normalized);
    void sdk?.settings.set(key, normalized);
  },
  removeItem(key: string): void {
    values.delete(key);
    void sdk?.settings.set(key, null);
  },
});

export async function initializeBrowserStorage(app: NammuApp): Promise<void> {
  sdk = app;
  values.clear();
  const settings = await app.settings.getAll();
  for (const key of LEGACY_KEYS) {
    const current = settings[key];
    if (typeof current === 'string') {
      values.set(key, current);
      continue;
    }
    const legacy = await app.migration.readLegacyStorage(key);
    if (legacy === null) continue;
    values.set(key, legacy);
    await app.settings.set(key, legacy);
    await app.migration.completeLegacyStorage(key);
  }
}
