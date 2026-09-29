import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import type { Translate } from './messages'

interface Props { t: Translate; text: string; filename: string; onClose(): void }

export function MermaidDialog({ t, text, filename, onClose }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { area.current?.focus(); area.current?.select() }, [])

  const copy = async () => {
    try { await navigator.clipboard.writeText(text) } catch { area.current?.select(); document.execCommand?.('copy') }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: filename })
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mermaid-title">
        <header>
          <h2 id="mermaid-title">{t('mermaid.title')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
        </header>
        <p className="muted">{t('mermaid.hint')}</p>
        <textarea ref={area} readOnly value={text} spellCheck={false} aria-label={t('mermaid.title')} />
        <footer>
          <button type="button" className="btn primary" onClick={copy}><Icon name="copy" size={16} /> {copied ? t('mermaid.copied') : t('mermaid.copy')}</button>
          <button type="button" className="btn" onClick={download}><Icon name="download" size={16} /> {t('mermaid.download')}</button>
        </footer>
      </div>
    </div>
  )
}
