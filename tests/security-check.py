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
# ページから読み込める拡張リソースは内蔵 favicon エンドポイントだけ
war = manifest['web_accessible_resources']
assert len(war) == 1 and war[0]['resources'] == ['_favicon/*']
assert "connect-src 'none'" in manifest['content_security_policy']['extension_pages']
assert "img-src 'self'" in manifest['content_security_policy']['extension_pages']
assert manifest['side_panel']['default_path'] == 'sidepanel.html'
assert manifest['background']['service_worker'] == 'background.js'
files = ('sidepanel.js', 'background.js', 'rail.js')
source = '\n'.join((ROOT / file).read_text(encoding='utf-8') for file in files)
# Comments/documentation may mention these APIs; inspect call expressions only.
for pattern in [r'\bfetch\s*\(', r'\bXMLHttpRequest\s*\(', r'\bWebSocket\s*\(',
                r'\bsendBeacon\s*\(', r'\bchrome\.scripting\b', r'\beval\s*\(',
                r'\binnerHTML\s*=', r'\bchrome\.storage\b', r'\blocalStorage\s*\.']:
    assert not re.search(pattern, source), f'Forbidden call: {pattern}'
rail = (ROOT / 'rail.js').read_text(encoding='utf-8')
assert 'attachShadow' in rail  # レールは Shadow DOM でページから隔離する
html = (ROOT / 'sidepanel.html').read_text(encoding='utf-8')
assert '<script src="sidepanel.js" defer>' in html
assert 'https://' not in html and 'http://' not in html
assert 'onerror=' not in html and 'onclick=' not in html
assert (ROOT / 'icons/icon128.png').exists()
print('OK: Manifest V3, least-privilege set + rail overlay (isolated), no external-code or outbound network calls detected')
