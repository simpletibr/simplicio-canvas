# Simplicio Canvas

[← English](../../README.md) · **Türkçe**

Yerel öncelikli 2B akış görüntüleyici. Bir GitHub projesinin bağlantısını yapıştırın; akışlarını akış şemaları olarak görün (giriş noktası → adımlar → çağrılar, her adımın ne yaptığı ve kaynağıyla) ve ardından gerçek ya da simüle edilmiş bir çalıştırmayı, her LLM çağrısı dahil, adım adım yeniden oynatın.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Yerelde çalıştırın: `npm run dev` → http://127.0.0.1:5173

- **Akışlar** — mimari ve her giriş noktası için bir akış, Mermaid dışa aktarımıyla.
- **Yeniden oynatma** — bir `simplicio.trace/v1` dosyası veya `simplicio-loop turbo`nun yazdırdığı JSON’u yükleyin; oynat, duraklat, adım adım ilerle; her LLM çağrısını model, token, maliyet, gecikme ve istem/yanıt önizlemesiyle görün.
- **Simülasyon** — bir istek yazın ve hiçbir şey çalıştırmadan nereye gideceğini ve nedenini izleyin.

Kod makinenizde kalır: dosyalar tarayıcıda okunur, asla yüklenmez.

![Simplicio Canvas](../images/flows.png)

[Trace biçimi](../trace-format.md) · [Simülasyon](../simulation.md) · [MIT](../../LICENSE)
