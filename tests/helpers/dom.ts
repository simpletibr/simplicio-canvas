/** The few browser APIs React Flow and the app need that jsdom (or Node's own globals) do not provide. */
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
class DOMMatrixStub { m22 = 1; m41 = 0; m42 = 0; constructor(_transform?: string) {} }

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size }, clear: () => data.clear(), getItem: (key) => data.get(key) ?? null, key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) }, setItem: (key, value) => { data.set(key, String(value)) },
  }
}

export function installDomStubs() {
  // React Flow's minimap divides by node sizes that jsdom never measures; the warning is noise here, not a bug.
  const error = console.error.bind(console)
  console.error = (...args: unknown[]) => { if (typeof args[0] === 'string' && args[0].includes('Received NaN for the')) return; error(...args) }
  const target = globalThis as Record<string, unknown>
  target.ResizeObserver ??= ResizeObserverStub
  target.DOMMatrixReadOnly ??= DOMMatrixStub
  const storage = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
  window.HTMLElement.prototype.scrollIntoView ??= () => {}
}

/** jsdom's Blob lacks .text() in some versions; the app reads picked files with it. */
export function installFileText() {
  if (typeof Blob.prototype.text === 'function') return
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(this) })
  }
}
