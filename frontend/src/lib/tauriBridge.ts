'use client'

/**
 * Returns true if the current runtime is the Tauri WebView.
 */
export const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  return '__TAURI_IPC__' in window
}

type UnlistenFn = () => void

type TauriEvent = { payload: unknown }
type TauriEventApi = {
  emit: (event: string, payload?: unknown) => Promise<void> | void
  listen: (event: string, handler: (evt: TauriEvent) => void) => Promise<UnlistenFn> | UnlistenFn
}

const getTauriEventApi = (): TauriEventApi | null => {
  if (typeof window === 'undefined') return null
  const maybe = (window as unknown as { __TAURI__?: { event?: unknown } }).__TAURI__?.event as Partial<TauriEventApi> | undefined
  if (!maybe?.emit || !maybe?.listen) return null
  return maybe as TauriEventApi
}

/**
 * Emits a Tauri event (no-op when not running inside Tauri).
 */
export async function emitTauriEvent<T>(event: string, payload?: T) {
  if (!isTauriRuntime()) return
  const api = getTauriEventApi()
  if (!api) return
  await api.emit(event, payload)
}

/**
 * Subscribes to a Tauri event and returns a disposer (no-op outside Tauri).
 */
export async function listenTauriEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {}
  }
  const api = getTauriEventApi()
  if (!api) return () => {}
  const unlisten = await api.listen(event, (evt) => handler(evt.payload as T))
  return () => unlisten()
}

/**
 * Emits an event and waits for the current call stack to flush.
 */
export async function requestTauriState(event: string) {
  if (!isTauriRuntime()) return
  const api = getTauriEventApi()
  if (!api) return
  await api.emit(event, null)
}
