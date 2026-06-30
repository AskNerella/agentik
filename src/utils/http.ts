/**
 * Unified HTTP fetch utility.
 *
 * • In a Tauri desktop context  → uses @tauri-apps/plugin-http which routes
 *   requests through Rust/reqwest, completely bypassing browser CORS.
 * • In a plain browser (dev:ui) → uses the browser fetch implementation and
 *   therefore requires the remote server to allow the browser origin.
 *
 * No external proxy process is required when running as a desktop app.
 */

// Lazy-initialised Tauri fetch so the import doesn't break browser bundles.
let _tauriFetch: typeof fetch | null = null
let _resolved = false

/** True when running inside a Tauri desktop window. */
export function isTauriContext(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function resolveTauriFetch(): Promise<typeof fetch> {
  if (_resolved && _tauriFetch) return _tauriFetch
  _resolved = true

  // Dynamic import prevents browser-only runs from initializing the Tauri API.
  // Import failures are intentionally surfaced: browser fetch inside a Tauri
  // window would reintroduce CORS and hide a broken plugin configuration.
  const mod = await import('@tauri-apps/plugin-http')
  _tauriFetch = mod.fetch as unknown as typeof fetch
  return _tauriFetch
}

/**
 * Drop-in replacement for `fetch`.
 *
 * - Tauri context : calls the native HTTP plugin → no CORS, no proxy needed.
 * - Browser context: calls the browser fetch implementation directly.
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isTauriContext()) {
    const tauriFetch = await resolveTauriFetch()
    return tauriFetch(url, init)
  }
  return fetch(url, init)
}
