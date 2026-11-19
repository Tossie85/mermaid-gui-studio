/**
 * make-webview.mjs が作った media/ を検める。
 *
 * ビルドが「通った」だけでは、中身が拡張として成立しているとは限らない。
 * Webview が白画面のまま出る壊れ方（プレースホルダが残っている、Host が入っていない、
 * mermaid が同梱されていない）を公開前に捕まえるための確認。CI から呼ぶ。
 *
 * 実行: node build/check-build.mjs
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const html = await readFile(resolve(root, 'media/index.html'), 'utf8');
const lib = await stat(resolve(root, 'media/mermaid.min.js'));
const vendor = await stat(resolve(root, 'vendor/mermaid.min.js'));

const checks = [
  ['mermaid の読み込みがプレースホルダになっている', html.includes('src="__MERMAID_URI__"')],
  ['CSP が入っている', html.includes('Content-Security-Policy')],
  ['外部通信を禁じている', html.includes("default-src 'none'")],
  ['nonce が付いている', html.includes('nonce="__NONCE__"')],
  ['VS Code 版の Host が入っている', html.includes('acquireVsCodeApi')],
  ['保存の委譲が入っている', html.includes('Host.saveFile')],
  ['読み込みの委譲が入っている', html.includes('Host.openFile')],
  ['テーマ上書きが入っている', html.includes('--vscode-editor-background')],
  ['サイト用メニューが残っていない', !html.includes('tools-nav.js')],
  ['サイトの相対パスが残っていない', !html.includes('"../assets/vendor/mermaid.min.js"')],
  ['mermaid が vendor と同じ大きさで同梱されている', lib.size === vendor.size],
  ['mermaid が空でない', lib.size > 1000000],
];

let ng = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '  OK  ' : '  NG  ') + name);
  if (!ok) ng++;
}
if (ng) {
  console.error(`\n${ng} 件が期待どおりではありません。media/ を作り直してください。`);
  process.exit(1);
}
console.log(`\n${checks.length} 件すべて期待どおりです。`);
