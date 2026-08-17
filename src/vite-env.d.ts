/// <reference types="vite/client" />

import type { ToqiApi } from '../electron/preload'

declare global {
  interface Window {
    toqi: ToqiApi
  }
}

export {}
