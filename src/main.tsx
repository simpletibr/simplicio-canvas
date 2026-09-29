import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './style.css'

document.documentElement.classList.toggle('demo-mode', __DEMO_MODE__)
if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => undefined)
}

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)
