"""拡張機能の宣言・スクリプトを静的検査（Chrome実機動作テストではない）。"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['manifest_version'] == 3
assert set(manifest['permissions']) == {'sidePanel', 'tabs', 'tabGroups', 'favicon'}
assert 'host_permissions' not in manifest
assert 'optional_host_permissions' not in manifest
assert 'externally_connectable' not in manifest
# 右端レールの content script は rail.js 1 本だけ・トップフレームのみ・CSS 注入なし
cs = manifest['content_scripts']
assert len(cs) == 1 and cs[0]['js'] == ['rail.js']
assert cs[0]['run_at'] == 'document_idle' and cs[0]['all_frames'] is False
assert 'css' not in cs[0]
assert set(cs[0]['matches']) <= {'http://*/*', 'https://*/*', 'file:///*'}
# ページから読み込める拡張リソースは、内蔵 favicon エンドポイントとレールの検索欄（search.html）だけ
war = manifest['web_accessible_resources']
assert len(war) == 1 and war[0]['resources'] == ['_favicon/*', 'search.html']
# 静的 ID で公開すると、任意のページが _favicon を引いて閲覧履歴の有無を判別できるため、動的 ID に限る
assert war[0].get('use_dynamic_url') is True
# use_dynamic_url は Chrome 129 以前では無視され（守りが効かない）、130・131 は content script から
# 動的 URL を読むときに拡張側の CSP で止められる不具合があった（132.0.6796.0 で修正）
assert int(manifest['minimum_chrome_version'].split('.')[0]) >= 132
csp = manifest['content_security_policy']['extension_pages']
for directive in ("default-src 'none'", "connect-src 'none'", "img-src 'self'",
                  "object-src 'none'", "base-uri 'none'", "form-action 'none'"):
    assert directive in csp, f'CSP missing: {directive}'
assert manifest['side_panel']['default_path'] == 'sidepanel.html'
assert manifest['background']['service_worker'] == 'background.js'
files = ('sidepanel.js', 'background.js', 'rail.js', 'rail-config.js', 'search.js') + tuple(
    str(p.relative_to(ROOT)).replace('\\', '/')
    for p in sorted((ROOT / 'i18n').glob('*.js')))
source = '\n'.join((ROOT / file).read_text(encoding='utf-8') for file in files)
# Comments/documentation may mention these APIs; inspect call expressions only.
for pattern in [
        # 通信（content script の rail.js は拡張の CSP の外で動くので、コードの側で止める）
        r'\bfetch\s*\(', r'\bXMLHttpRequest\s*\(', r'\bWebSocket\s*\(', r'\bsendBeacon\s*\(',
        r'\bEventSource\s*\(', r'\bRTCPeerConnection\b', r'\bWebTransport\b',
        r'''['"`]https?://''',
        # 保存（プライバシーポリシーで「使わない」と書いているもの）
        r'\bchrome\.storage\b', r'\blocalStorage\s*\.', r'\bsessionStorage\b', r'\bindexedDB\b',
        r'\bcaches\s*\.', r'\bdocument\.cookie\b', r'\bopenDatabase\s*\(',
        # 文字列からのコード実行・HTML の流し込み
        r'\bchrome\.scripting\b', r'\beval\s*\(', r'\bnew\s+Function\b',
        r'''\bset(?:Timeout|Interval)\s*\(\s*['"`]''',
        r'\binnerHTML\s*=', r'\bouterHTML\s*=', r'\binsertAdjacentHTML\b']:
    assert not re.search(pattern, source), f'Forbidden call: {pattern}'
rail = (ROOT / 'rail.js').read_text(encoding='utf-8')
assert 'attachShadow' in rail  # レールは Shadow DOM でページから隔離する
# ページの中に入力欄を置くと、打った文字がページのスクリプトの capture リスナから見える。
# 文字の入力は拡張のページ（search.html の iframe）だけで受ける
assert not re.search(r'''(?:\bel|createElement)\(\s*['"`](?:input|textarea)['"`]''', rail), \
    'rail.js must not create text inputs in the page; use the search.html iframe'
assert 'contenteditable' not in rail.lower()
assert "chrome.runtime.getURL('search.html')" in rail
for page, script in (('sidepanel.html', 'sidepanel.js'), ('search.html', 'search.js')):
    html = (ROOT / page).read_text(encoding='utf-8')
    assert f'<script src="{script}" defer>' in html, page
    assert 'https://' not in html and 'http://' not in html, page
    assert 'onerror=' not in html and 'onclick=' not in html, page
assert (ROOT / 'icons/icon128.png').exists()
print('OK: Manifest V3, least-privilege set + rail overlay (isolated), no external-code, storage, or outbound network calls detected')
