/**
 * Production builds ship a Content-Security-Policy that keeps the promise "local-first and private" enforceable:
 * the page can only load its own files and can only talk to its own origin (the local import bridge, or nothing at all
 * in the hosted demo). Development is left alone because Vite's HMR needs inline scripts and a websocket.
 */
import type { Plugin } from 'vite'

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function cspPlugin(): Plugin {
  return {
    name: 'simplicio-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}">`),
  }
}
