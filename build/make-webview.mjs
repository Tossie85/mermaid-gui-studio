/**
 * tools/mermaid-gui-studio-2.html から、VS Code の Webview 用HTMLを生成する。
 *
 * MGS2 本体には手を入れず、ここでの差し替えは次の3つだけに留めている。
 *   1. インライン <script> / <style> と mermaid の読み込みに nonce を付ける（CSP対応）
 *   2. <script src> を Webview のURIプレースホルダへ差し替え、tools-nav.js を外す
 *   3. 末尾に VS Code 版の Host 実装を足して上書きする
 *
 * 差し替え対象が1つでも見つからなければ、生成せずに異常終了する。
 * MGS2 側の改修でパターンが外れたことに気づかないまま、壊れた拡張を配るのを防ぐため。
 *
 * 実行: node vscode-extensions/mermaid/build/make-webview.mjs
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const SRC_HTML = resolve(repoRoot, 'tools/mermaid-gui-studio-2.html');
const SRC_MERMAID = resolve(repoRoot, 'assets/vendor/mermaid.min.js');
const OUT_DIR = resolve(here, '..', 'media');

/** 期待した差し替えが起きたかを必ず確かめる。0件でも複数件でも異常として止める。 */
function replaceExactlyOnce(text, find, replaceWith, what) {
  const parts = text.split(find);
  if (parts.length !== 2) {
    throw new Error(
      `[make-webview] ${what} の差し替えに失敗しました（一致 ${parts.length - 1} 件、期待 1 件）。\n` +
      `  探した文字列: ${JSON.stringify(String(find).slice(0, 90))}\n` +
      `  MGS2 側の改修でこの箇所が変わった可能性があります。README の「MGS2との同期方法」を確認してください。`
    );
  }
  return parts.join(replaceWith);
}

function replaceAllOrFail(text, find, replaceWith, what, expected) {
  const hits = text.split(find).length - 1;
  if (hits !== expected) {
    throw new Error(
      `[make-webview] ${what} の件数が変わりました（${hits} 件、期待 ${expected} 件）。\n` +
      `  MGS2 側で <script> / <style> が増減した可能性があります。このスクリプトの期待値を更新してください。`
    );
  }
  return text.split(find).join(replaceWith);
}

/* MGS2 の配色トークンを VS Code のテーマ変数へ差し替える。
   VS Code は Webview に --vscode-* を自動で流し込むので、これを敷くだけで
   ライト / ダーク / ハイコントラストのどのテーマにも馴染む。
   アクセント（シアン・アンバー）はツールの識別色なので固定のまま残す。
   図そのものの色（Mermaid のテーマ）は利用者の明示選択に任せる。
   ここを自動追従させると .svg / .html で保存した図まで暗くなるため。 */
const THEME_CSS = `
<style nonce="__NONCE__">
  :root{
    /* 面 */
    --surface-app: var(--vscode-editor-background);
    --surface-header: var(--vscode-sideBar-background, var(--vscode-editor-background));
    --surface-control: var(--vscode-input-background, var(--vscode-editor-background));
    --surface-panel: var(--vscode-sideBar-background, var(--vscode-editor-background));
    --surface-card: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --surface-input: var(--vscode-input-background, var(--vscode-editor-background));
    /* --surface-canvas はここでは触らない。
       図の文字色はMermaidのテーマで決まるため、地の色は「キャンバス」の設定で
       利用者が選ぶ（既定は図に合わせる）。エディタの背景に追従させると、
       明るいテーマの図を暗い地に載せて文字が読めなくなる。 */
    --surface-subtle: var(--vscode-list-hoverBackground, var(--vscode-editor-background));
    --surface-note: var(--vscode-textBlockQuote-background, var(--vscode-editor-background));
    --surface-cancel: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
    /* プレビュー上に浮くバー。既定は白固定なので、暗いテーマだと文字が読めなくなる */
    --surface-overlay: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --overlay-veil: rgba(0,0,0,0.55);
    --shadow-soft: var(--vscode-widget-shadow, rgba(0,0,0,0.2));
    --shadow-strong: var(--vscode-widget-shadow, rgba(0,0,0,0.4));
    --surface-picked: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
    /* 文字 */
    --text-main: var(--vscode-foreground);
    --text-strong: var(--vscode-foreground);
    /* アクセント面（シアン）は明るいままなので、その上の文字は濃いままにする */
    --text-on-accent: #0A1830;
    --text-dim: var(--vscode-descriptionForeground, var(--vscode-foreground));
    --text-note: var(--vscode-foreground);
    --text-faint: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
    --text-on-dark: var(--vscode-foreground);
    --text-on-dark-dim: var(--vscode-descriptionForeground, var(--vscode-foreground));
    --text-on-dark-strong: var(--vscode-foreground);
    /* 線 */
    --border-dark: var(--vscode-panel-border, var(--vscode-contrastBorder, transparent));
    --border-strong: var(--vscode-input-border, var(--vscode-panel-border, transparent));
    --border-soft: var(--vscode-panel-border, transparent);
    --border-dashed: var(--vscode-panel-border, transparent);
    --border-note: var(--vscode-panel-border, transparent);
    --border-swatch: var(--vscode-panel-border, transparent);
    --accent-border: var(--vscode-panel-border, transparent);
    /* アクセントの淡い面。ここを既定の薄いシアンのままにすると、
       上に載る文字はテーマ側の色になるので暗いテーマで読めなくなる（実測1.46）。 */
    --accent-tint: var(--vscode-list-hoverBackground, var(--vscode-editor-background));
    --accent-tint-soft: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --accent-tint-strong: var(--vscode-list-hoverBackground, var(--vscode-editor-background));
    /* 選択中の行。VS Codeの選択色に合わせる */
    --warn-tint: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
    /* コード欄はエディタの見た目に寄せる */
    --code-text: var(--vscode-editor-foreground);
    --code-text-dim: var(--vscode-descriptionForeground, var(--vscode-editor-foreground));
    --code-gutter: var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground));
    --code-selection: var(--vscode-editor-selectionBackground);
    --grip-dark: var(--vscode-panel-border, var(--vscode-descriptionForeground));
    /* 危険側はエディタのエラー色に合わせる。
       editorError-foreground はエディタの地（暗い面）に載る前提の色で、
       入力欄のような一段明るい面に置くとコントラストが足りない（実測3.64）。
       文字用に用意されている errorForeground を優先する。 */
    --danger: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #E8637A));
    --danger-text: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #9B2C43));
    --danger-on-dark: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #F2A0B0));
    --danger-on-dark-strong: var(--vscode-errorForeground, var(--vscode-editorError-foreground, #FF8DA1));
    --danger-tint: var(--vscode-inputValidation-errorBackground, var(--vscode-list-hoverBackground));
  }
  /* 既定のシアンは明るい面に載せると文字が読めない（実測 1.7〜2.6）。
     VS Codeが body に付けるテーマ種別のクラスを見て、明るいテーマだけ濃い色に差し替える。
     --accent は文字色にも枠線にも使われるので、両方成り立つ濃さにしている。 */
  body.vscode-light, body.vscode-high-contrast-light{
    --accent:#0F6070;
    --accent-dim:#136B7A;
    --text-on-accent:#FFFFFF;   /* アクセントが濃くなるので、その上の文字は白 */
    /* 注意色（アンバー）は明るいままなので、その上の文字は濃いままにする */
    --text-on-warn:#0A1830;
  }
  /* ✎ と ⠿ は操作できることを示すアイコン。補助文字の色のままだと
     一段明るい行の上でコントラストが足りない（実測4.3前後）ので、アイコン用の色にする。 */
  .item-row button.edit-btn, .item-row .drag-handle{
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
  }
  /* 入力欄はテーマの文字色を使う（既定の濃紺前提の色が残らないように） */
  .field input, .field select, .field textarea, #codeArea{ color: var(--vscode-input-foreground, var(--vscode-foreground)); }
  /* ボタンはエディタのボタン色に寄せる */
  .add-row-btn{ background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .add-row-btn:hover{ background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
</style>
`;

/** Webview 用の Host 実装。保存と読み込みだけ拡張ホストへ委譲する。 */
const VSCODE_HOST = `
<script nonce="__NONCE__">
/* VS Code 版の Host。MGS2 本体の Host をここで上書きする。
   ・保存 / 読み込み … Webview では <a download> も file input も使えないので拡張ホストへ委譲
   ・通知 / 確認     … ツール内のモーダルをそのまま使う（alert/confirm はWebviewで動かないため） */
(function(){
  const vscode = acquireVsCodeApi();
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', ev=>{
    const msg = ev.data;
    if(!msg || msg.type !== 'reply') return;
    const resolve = pending.get(msg.id);
    if(resolve){ pending.delete(msg.id); resolve(msg.payload); }
  });

  function call(action, payload){
    return new Promise(resolve=>{
      const id = ++seq;
      pending.set(id, resolve);
      vscode.postMessage({ type:'request', id, action, payload });
    });
  }

  Host.saveFile = (filename, mime, content)=> call('saveFile', { filename, content });
  Host.openFile = ()=> call('openFile');
  // .html 保存で mermaid 本体を読み直すため、Webview から取得できるURLを返す。
  // 変数名にプレースホルダ（__MERMAID_URI__）と同じ文字を使うと、
  // 拡張側の一括置換でこの行まで書き換わって構文エラーになるので避けている
  Host.assetUrl = ()=> window.__mgsMermaidUrl;
  // ℹ️ のダイアログに出す拡張のバージョン（拡張ホストが <head> で渡している）
  Host.appVersion = window.__mgsAppVersion || null;
})();
</script>
`;

async function main() {
  // 元ファイルはWindows側で編集されるためCRLFになることがある。
  // 以降の一致判定を改行コードに左右されないよう、読み込み時にLFへ揃える
  let html = (await readFile(SRC_HTML, 'utf8')).replace(/\r\n/g, '\n');

  // 1. サイト用のツール切替メニューは拡張では不要
  html = replaceExactlyOnce(
    html, '<script src="../assets/tools-nav.js"></script>', '',
    'tools-nav.js の除去'
  );

  // 2. mermaid 本体は Webview のURIから読む
  html = replaceExactlyOnce(
    html,
    '<script src="../assets/vendor/mermaid.min.js"></script>',
    '<script nonce="__NONCE__" src="__MERMAID_URI__"></script>',
    'mermaid.min.js の読み込み'
  );

  // 3. インライン <script> / <style> に nonce（CSPで許可するため）
  html = replaceAllOrFail(html, '<script>', '<script nonce="__NONCE__">', 'インライン script', 3);
  html = replaceAllOrFail(html, '<style>', '<style nonce="__NONCE__">', 'インライン style', 1);

  // 4. CSP を head に差し込む。
  //    Mermaid は描画時にSVGへ <style> を差し込むので style は 'unsafe-inline' が要る。
  //    スクリプトは nonce で固定し、外部通信はすべて禁止する。
  const csp =
    `<meta http-equiv="Content-Security-Policy" content="` +
    `default-src 'none'; ` +
    `img-src __CSP_SOURCE__ data:; ` +
    `style-src __CSP_SOURCE__ 'unsafe-inline'; ` +
    `script-src 'nonce-__NONCE__'; ` +
    `font-src __CSP_SOURCE__; ` +
    `connect-src __CSP_SOURCE__;">`;
  // ページ冒頭の head を狙う。同じ meta は「.html 保存」用のテンプレート文字列にもあるため、
  // 直後の viewport 指定まで含めて一意にする
  const headAnchor = '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  html = replaceExactlyOnce(html, headAnchor, headAnchor + '\n' + csp, 'CSP の挿入');

  // 5. 配色トークンをVS Codeのテーマ変数へ差し替える。
  //    本体の <style> より後ろに置いて、:root の値を上書きする
  //    </head> は「.html 保存」用のテンプレートにもあるので、本体の <style> 直後を狙う
  html = replaceExactlyOnce(html, '</style>\n</head>', '</style>\n' + THEME_CSS + '</head>', 'テーマ上書きの挿入');

  // 6. VS Code 版 Host を最後に足して上書き。
  //    </body> は「.html 保存」用のテンプレートにもあるので、ページ末尾の閉じタグを狙う
  const tailAnchor = '</body>\n</html>';
  html = replaceExactlyOnce(html, tailAnchor, VSCODE_HOST + tailAnchor, 'Host 実装の追記');

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'index.html'), html, 'utf8');
  await copyFile(SRC_MERMAID, resolve(OUT_DIR, 'mermaid.min.js'));

  console.log('[make-webview] 生成しました:');
  console.log('  ' + resolve(OUT_DIR, 'index.html'));
  console.log('  ' + resolve(OUT_DIR, 'mermaid.min.js'));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
