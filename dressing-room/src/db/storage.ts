export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export async function storageInfo(): Promise<{ persisted: boolean; usage: number; quota: number }> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = (await navigator.storage?.estimate?.()) ?? {};
    return { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch { return { persisted: false, usage: 0, quota: 0 }; }
}

export function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)}GB`;
  if (n >= 1 << 20) return `${Math.round(n / (1 << 20))}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}
