import type { DesktopApi } from '../shared/desktop'

declare global {
  interface Window {
    // 浏览器预览没有 preload，必须允许不存在。
    desktop?: DesktopApi
  }
}

export {}
