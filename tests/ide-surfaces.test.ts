import { describe, expect, it } from 'vitest'
import { TERMINAL_CONFIRMATION, BrowserTerminalAdapter, GuardedProcessAdapter, validateTerminalRequest } from '../src/domain/terminal-adapter'
import { createMonacoLoader, LazyEditorHost } from '../src/domain/lazy-editor'
import { createPublisherReceipt, verifyArtifact, type DistributionArtifact } from '../src/domain/distribution-contract'
import { createSigningProvider } from '../src/domain/signing-provider'
import { choosePwaUpdate, hostCapabilities, validatePwaRelease } from '../src/domain/pwa-lifecycle'

const trust = { trusted: true, root: '/workspace' }

describe('extension host and release contracts', () => {
  it('requires explicit terminal confirmation and never starts a browser process', async () => {
    expect(validateTerminalRequest({ command: 'mapper scan .', cwd: '/tmp', confirmation: TERMINAL_CONFIRMATION }, trust)).toContain('cwd must stay inside a trusted workspace')
    expect(validateTerminalRequest({ command: 'mapper scan .', cwd: '/workspace', env: { API_KEY: 'x' }, confirmation: TERMINAL_CONFIRMATION }, trust).some((error) => error.includes('environment key'))).toBe(true)
    const adapter = new BrowserTerminalAdapter(); const receipt = await adapter.run({ command: 'mapper scan .', cwd: '/workspace', confirmation: TERMINAL_CONFIRMATION }); expect(receipt.mode).toBe('browser-simulated'); expect(receipt.output).toContain('read-only')
  })

  it('streams a bounded host process through workspace and abort boundaries', async () => {
    let seenSignal: AbortSignal | undefined
    const adapter = new GuardedProcessAdapter(trust, async (request, onChunk, signal) => { seenSignal = signal; onChunk('x'.repeat(120_000)); return request.command.includes('ok') ? 0 : 1 })
    const receipt = await adapter.run({ command: 'ok', cwd: '/workspace', confirmation: TERMINAL_CONFIRMATION }); expect(receipt.mode).toBe('local-pty'); expect(receipt.exitCode).toBe(0); expect(receipt.output.length).toBe(100_000); expect(seenSignal?.aborted).toBe(false)
    await expect(adapter.run({ command: 'ok', cwd: '/tmp', confirmation: TERMINAL_CONFIRMATION })).rejects.toThrow('trusted workspace')
  })

  it('loads the editor engine lazily once and reveals requested locations', async () => {
    let loads = 0; let value = ''; let location = ''; let disposed = false
    const host = new LazyEditorHost(async () => { loads += 1; return { setValue: (next: string) => { value = next }, getValue: () => value, reveal: (line, column) => { location = `${line}:${column}` }, dispose: () => { disposed = true } } })
    const first = await host.open('one', 0, 0); const second = await host.open('two', 4, 7); expect(first).toBe(second); expect(loads).toBe(1); expect(value).toBe('two'); expect(location).toBe('4:7'); expect(host.getState().status).toBe('ready'); host.dispose(); expect(disposed).toBe(true)
  })

  it('adapts a lazy Monaco module without bundling it into the browser MVP', async () => {
    const calls: string[] = []; let content = ''; const container = {} as HTMLElement; const loader = createMonacoLoader(async () => ({ editor: { create: (host, options) => { expect(host).toBe(container); expect(options.automaticLayout).toBe(true); calls.push('create'); return { setValue: (value) => { content = value }, getValue: () => content, revealPositionInCenter: (position) => calls.push(`reveal:${position.lineNumber}:${position.column}`), layout: () => calls.push('layout'), dispose: () => calls.push('dispose') } } } }), container)
    const engine = await loader(); engine.setValue('source'); expect(engine.getValue()).toBe('source'); engine.reveal(3, 2); engine.dispose(); expect(calls).toEqual(['create', 'reveal:3:2', 'dispose'])
  })

  it('verifies release checksums and publisher signatures without trusting intent', async () => {
    const sha256 = 'a'.repeat(64); const artifact: DistributionArtifact = { name: 'simplicio-canvas', version: '2.4.0', platform: 'web', bytes: 42, sha256, signature: 'sig', signer: 'release-key' }
    expect((await verifyArtifact(artifact, 'b'.repeat(64))).status).toBe('invalid'); expect((await verifyArtifact({ ...artifact, signature: undefined, signer: undefined }, sha256)).status).toBe('checksum-only')
    const receipt = await createPublisherReceipt('2.4.0', [artifact], { 'simplicio-canvas:web': sha256 }, { verify: async (payload, signature, signer) => payload.includes('simplicio-canvas') && signature === 'sig' && signer === 'release-key' }); expect(receipt.artifacts[0].status).toBe('signed')
  })

  it('delegates signing and verification to an injected Cosign/Minisign runner', async () => {
    const calls: string[][] = []; const provider = createSigningProvider({ tool: 'cosign', keyRef: 'env://COSIGN_KEY', publicKeyRef: 'release.pub' }, { run: async (command, args, input) => { calls.push([command, ...args]); expect(input).toContain('payload'); return { exitCode: 0, stdout: calls.length === 1 ? 'real-signature-from-ci' : '', stderr: '' } } })
    expect(await provider.sign('payload')).toBe('real-signature-from-ci'); expect(await provider.verify('payload', 'real-signature-from-ci')).toBe(true); expect(calls[0]).toContain('sign-blob'); expect(calls[1]).toContain('verify-blob')
  })

  it('keeps browser capabilities read-only and chooses verified PWA rollback/update', () => {
    expect(hostCapabilities('browser')).toMatchObject({ filesystem: false, process: false, git: false, sourceUpload: false }); const current = { version: '2.0.0', cacheName: 'simplicio-canvas-v1', integrity: 'a'.repeat(64) }; const candidate = { version: '2.1.0', cacheName: 'simplicio-canvas-v2', integrity: 'b'.repeat(64) }
    expect(validatePwaRelease(candidate)).toEqual([]); expect(choosePwaUpdate(current, candidate, 'healthy').action).toBe('activate'); expect(choosePwaUpdate(current, candidate, 'failed').action).toBe('rollback'); expect(choosePwaUpdate(current, candidate, 'unknown').action).toBe('keep')
  })
})
