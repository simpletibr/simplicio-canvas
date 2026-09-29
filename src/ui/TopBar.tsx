import type { ChangeEvent, FormEvent } from 'react'
import { LOCALES, LOCALE_LABELS, type Locale } from '../domain/locale'
import type { AppPolicy } from '../domain/demo-policy'
import { Icon } from './icons'
import type { Translate } from './messages'

export type View = 'architecture' | 'flows' | 'run'
const VIEWS: View[] = ['architecture', 'flows', 'run']

export interface TopBarProps {
  t: Translate
  locale: Locale
  onLocale(locale: Locale): void
  view: View
  onView(view: View): void
  policy: AppPolicy
  demo: boolean
  link: string
  onLink(value: string): void
  onImport(): void
  busy: boolean
  onFolder(files: FileList): void
  onExample(): void
  onExport(): void
  canExport: boolean
}

export function TopBar({ t, locale, onLocale, view, onView, policy, demo, link, onLink, onImport, busy, onFolder, onExample, onExport, canExport }: TopBarProps) {
  const submit = (event: FormEvent) => { event.preventDefault(); if (policy.canImportGitHub && link.trim() && !busy) onImport() }
  const pickFolder = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files?.length) onFolder(event.target.files); event.target.value = '' }
  return (
    <header className="topbar">
      <div className="brand"><span className="logo" aria-hidden="true">S/</span><div><b>{t('app.title').toUpperCase()}</b><small>{t('app.tagline')}{demo ? ` · ${t('app.demo')}` : ''}</small></div></div>
      <nav className="views" aria-label={t('nav.aria')}>
        {VIEWS.map((item) => <button type="button" key={item} className={item === view ? 'view on' : 'view'} aria-current={item === view ? 'page' : undefined} onClick={() => onView(item)}>{t(`view.${item}` as 'view.run')}</button>)}
      </nav>
      <form className="github" onSubmit={submit}>
        <input value={link} onChange={(event) => onLink(event.target.value)} placeholder={t('github.placeholder')} aria-label={t('github.aria')} disabled={!policy.canImportGitHub || busy} title={policy.canImportGitHub ? undefined : t('github.disabled')} spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn primary" disabled={!policy.canImportGitHub || busy || !link.trim()} title={policy.canImportGitHub ? undefined : t('github.disabled')}>{t('github.analyze')}</button>
      </form>
      <div className="actions">
        <label className={`btn${policy.canImportFolder ? '' : ' disabled'}`} title={policy.canImportFolder ? undefined : t('folder.disabled')}>
          <Icon name="folder" size={16} /> {t('folder.open')}
          <input type="file" hidden disabled={!policy.canImportFolder} onChange={pickFolder} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
        </label>
        <button type="button" className="btn" onClick={onExample}>{t('example.reset')}</button>
        <button type="button" className="btn" onClick={onExport} disabled={!canExport}><Icon name="diagram" size={16} /> {t('export.mermaid')}</button>
        <select className="lang" value={locale} onChange={(event) => onLocale(event.target.value as Locale)} aria-label={t('locale.aria')}>
          {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_LABELS[code]}</option>)}
        </select>
      </div>
    </header>
  )
}
