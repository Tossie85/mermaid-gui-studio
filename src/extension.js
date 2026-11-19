/**
 * Mermaid GUI Studio — VS Code 拡張のエントリポイント。
 *
 * Webview に載せるHTMLは build/make-webview.mjs が media/ に生成する。
 * ここでは「パネルを開く」「保存と読み込みを肩代わりする」だけを担う。
 * Webview は <a download> もファイル入力も使えないため、その2つは必ずこちら側で処理する。
 */
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/** CSPで許可するスクリプトを固定するための使い捨て文字列 */
function makeNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/** 保存先を尋ねて書き込む。キャンセルされたら false を返す。
    encoding が 'base64' のとき、content は base64 の文字列（PNG などのバイナリ）。 */
async function saveFile(filename, content, encoding) {
  const ext = path.extname(filename).replace('.', '') || 'txt';
  const uri = await vscode.window.showSaveDialog({
    saveLabel: '保存',
    defaultUri: vscode.Uri.file(path.join(defaultDir(), filename)),
    filters: { [ext.toUpperCase()]: [ext] },
  });
  if (!uri) return { saved: false };
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
  vscode.window.showInformationMessage(`保存しました: ${path.basename(uri.fsPath)}`);
  return { saved: true, path: uri.fsPath };
}

/** ファイルを1つ選ばせて中身を返す。キャンセルなら null。 */
async function openFile() {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: '開く',
    filters: { Mermaid: ['md', 'mmd', 'mermaid', 'markdown', 'txt'] },
  });
  if (!picked || !picked.length) return null;
  try {
    const bytes = await vscode.workspace.fs.readFile(picked[0]);
    return { name: path.basename(picked[0].fsPath), text: Buffer.from(bytes).toString('utf8') };
  } catch (err) {
    return { error: { message: String((err && err.message) || err) } };
  }
}

/** 保存ダイアログの初期位置。開いているフォルダがあればそこ、無ければホーム。 */
function defaultDir() {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length) return folders[0].uri.fsPath;
  return require('os').homedir();
}

function buildHtml(webview, extensionUri) {
  const mediaDir = vscode.Uri.joinPath(extensionUri, 'media');
  const htmlPath = vscode.Uri.joinPath(mediaDir, 'index.html');
  if (!fs.existsSync(htmlPath.fsPath)) {
    throw new Error(
      'media/index.html がありません。拡張のフォルダで次を実行してビルドしてください:\n  npm run build'
    );
  }
  const nonce = makeNonce();
  const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'mermaid.min.js'));

  let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
  html = html.split('__NONCE__').join(nonce);
  html = html.split('__CSP_SOURCE__').join(webview.cspSource);
  html = html.split('__MERMAID_URI__').join(mermaidUri.toString());
  // ℹ️ のダイアログに出す拡張のバージョン。publisher 名に依存しないよう package.json を直接読む
  let version = '';
  try {
    const pkgPath = vscode.Uri.joinPath(extensionUri, 'package.json').fsPath;
    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '';
  } catch (_) {
    // 取れなくてもツールは動くので、バージョン表示を諦めるだけにする
  }
  // .html 保存で mermaid 本体を読み直すため、URLをWebview側へ渡しておく。
  // 変数名は上の一括置換のプレースホルダと重ならない名前にしてある
  html = html.replace(
    '</head>',
    `<script nonce="${nonce}">window.__mgsMermaidUrl = ${JSON.stringify(mermaidUri.toString())};`
      + `window.__mgsAppVersion = ${JSON.stringify(version)};</script>\n</head>`
  );
  return html;
}

function activate(context) {
  let panel = null;

  // アクティビティバーのアイコンから開くビュー。
  // 中身は空のツリーにしておき、package.json の viewsWelcome に置いた
  // 「エディタで開く」ボタンを出す（項目が1つでもあると welcome は表示されない）。
  const emptyTree = {
    getChildren: () => [],
    getTreeItem: item => item,
  };
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mermaidGuiStudio.launcher', emptyTree)
  );

  // 下部のステータスバーからも1クリックで開けるようにする
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.command = 'mermaidGuiStudio.open';
  status.text = '$(type-hierarchy) Mermaid GUI';
  status.tooltip = 'Mermaid GUI Studio を開く';
  status.show();
  context.subscriptions.push(status);

  const disposable = vscode.commands.registerCommand('mermaidGuiStudio.open', () => {
    // すでに開いていれば作り直さず前面に出す（編集中の内容を失わせないため）
    if (panel) {
      panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    panel = vscode.window.createWebviewPanel(
      'mermaidGuiStudio',
      'Mermaid GUI Studio',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,   // タブを切り替えても編集中の図を保持する
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    try {
      panel.webview.html = buildHtml(panel.webview, context.extensionUri);
    } catch (err) {
      vscode.window.showErrorMessage(String((err && err.message) || err));
      panel.dispose();
      panel = null;
      return;
    }

    panel.webview.onDidReceiveMessage(async msg => {
      if (!msg || msg.type !== 'request') return;
      let payload = null;
      try {
        if (msg.action === 'saveFile') payload = await saveFile(msg.payload.filename, msg.payload.content, msg.payload.encoding);
        else if (msg.action === 'openFile') payload = await openFile();
      } catch (err) {
        vscode.window.showErrorMessage(String((err && err.message) || err));
        payload = { error: { message: String((err && err.message) || err) } };
      }
      panel.webview.postMessage({ type: 'reply', id: msg.id, payload });
    }, undefined, context.subscriptions);

    panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
