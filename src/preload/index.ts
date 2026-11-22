import { contextBridge, ipcRenderer } from 'electron'

// Side-effect install of the SmartSpectra SDK preload bridge
// (@smartspectra/node-sdk/preload). It exposes `__smartspectraBridge` on
// window, which @smartspectra/node-sdk/renderer uses to reach the main
// process SDK over a MessagePort. Kept as a single preload entry point
// alongside DiaRhythm's own contextBridge API.
// The subpath ships JS only; declare it so the side-effect import type-checks.
declare module '@smartspectra/node-sdk/preload';
import '@smartspectra/node-sdk/preload'

export type Channel = 'db:ping' | 'db:path' | 'sensing:config' | 'data:all' | 'data:save' | 'data:delete' | 'data:settings' | 'data:consent' | 'data:clear'
export type DataRow = Record<string, string | number | null | undefined>
export interface DataSnapshot {
  glucose: DataRow[]
  medications: DataRow[]
  events: DataRow[]
  logs: DataRow[]
  settings: Record<string, string>
}

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: Channel, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  ping: (): Promise<string> => ipcRenderer.invoke('db:ping'),
  dbPath: (): Promise<string> => ipcRenderer.invoke('db:path'),
  sensingConfig: (): Promise<{
    apiKey?: string
    bridgeReady: boolean
  }> => ipcRenderer.invoke('sensing:config'),
  getData: (): Promise<DataSnapshot> => ipcRenderer.invoke('data:all'),
  saveRecord: (kind: string, record: Record<string, unknown>): Promise<boolean> => ipcRenderer.invoke('data:save', kind, record),
  deleteRecord: (kind: string, id: number): Promise<boolean> => ipcRenderer.invoke('data:delete', kind, id),
  saveSetting: (key: string, value: string): Promise<boolean> => ipcRenderer.invoke('data:settings', key, value),
  saveConsent: (granted: boolean): Promise<boolean> => ipcRenderer.invoke('data:consent', granted),
  clearData: (): Promise<boolean> => ipcRenderer.invoke('data:clear'),
})

declare global {
  interface Window {
    api: {
      invoke: (channel: Channel, ...args: unknown[]) => Promise<unknown>
      ping: () => Promise<string>
      dbPath: () => Promise<string>
      sensingConfig: () => Promise<{
        apiKey?: string
        bridgeReady: boolean
      }>
      getData: () => Promise<DataSnapshot>
      saveRecord: (kind: string, record: Record<string, unknown>) => Promise<boolean>
      deleteRecord: (kind: string, id: number) => Promise<boolean>
      saveSetting: (key: string, value: string) => Promise<boolean>
      saveConsent: (granted: boolean) => Promise<boolean>
      clearData: () => Promise<boolean>
    }
    /** Exposed by @smartspectra/node-sdk/preload (context-isolated preload). */
    __smartspectraBridge?: {
      diagnostics: boolean
      attach(): void
      postMessage(message: unknown): void
      onMessage(callback: (data: unknown) => void): void
      close(): void
    }
  }
}
