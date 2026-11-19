/**
 * 検証用。media/index.html を extension.js と同じ手順で解決し、
 * acquireVsCodeApi だけスタブして、VS Code なしでブラウザから開けるコピーを作る。
 *
 * 生成先の tools/_webview_preview/ は動作確認のための一時物で、リポジトリには含めない。
 * 実行: node build/make-preview.mjs（npm run preview）
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SRC = resolve(here, '..', 'media', 'index.html');
const OUT_DIR = resolve(repoRoot, 'tools', '_webview_preview');

const NONCE = 'testnonce';
const MERMAID_URL = '../../assets/vendor/mermaid.min.js';

// 拡張ホストと同じく package.json の version を渡す（ℹ️ のダイアログに出る）
const VERSION = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8')).version || '';

const STUB = `<script nonce="${NONCE}">
window.__mgsMermaidUrl = ${JSON.stringify(MERMAID_URL)};
window.__mgsAppVersion = ${JSON.stringify(VERSION)};
window.acquireVsCodeApi = function(){
  window.__posted = [];
  return { postMessage(m){ window.__posted.push(m); } };
};
</script>
`;

const html = (await readFile(SRC, 'utf8'))
  .split('__NONCE__').join(NONCE)
  .split('__CSP_SOURCE__').join('*')
  .split('__MERMAID_URI__').join(MERMAID_URL)
  .replace('</head>', STUB + '</head>');

await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'index.html'), html, 'utf8');
console.log('[make-preview] 生成しました: ' + resolve(OUT_DIR, 'index.html'));
