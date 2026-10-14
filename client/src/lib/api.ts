export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const body = data as { error?: string; errors?: string[] } | null;
    if (res.status === 401 && path.startsWith('/api/') && !path.startsWith('/api/auth') && location.pathname.startsWith('/admin')) {
      location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
    }
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status, body);
  }
  return data as T;
}

export interface AppConfig {
  publicUrl: string | null;
  lanAddresses: string[];
  production: boolean;
}

let configPromise: Promise<AppConfig> | null = null;
export function getConfig(): Promise<AppConfig> {
  configPromise ??= api<AppConfig>('/api/config').catch(() => ({ publicUrl: null, lanAddresses: [], production: false }));
  return configPromise;
}

export function isLocalHost(hostname = window.location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/**
 * Works out the base URL that goes in the QR code. Priority:
 *   1. PUBLIC_URL configured on the server (production)
 *   2. The current origin, if it is not localhost
 *   3. The laptop's LAN IP (same Wi-Fi only) when browsing on localhost in development
 */
export async function getJoinBase(): Promise<{ base: string; warning: string | null }> {
  const cfg = await getConfig();
  if (cfg.publicUrl) return { base: cfg.publicUrl, warning: null };
  const { protocol, port, origin } = window.location;
  if (!isLocalHost()) return { base: origin, warning: null };
  if (cfg.lanAddresses.length > 0) {
    return {
      base: `${protocol}//${cfg.lanAddresses[0]}${port ? `:${port}` : ''}`,
      warning: 'Using your Wi-Fi address — students must be on the same network. Set PUBLIC_URL for internet access.',
    };
  }
  return { base: origin, warning: 'This is a localhost address — phones cannot open it. Set PUBLIC_URL.' };
}
