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
assert 'content_scripts' not in manifest
assert 'externally_connectable' not in manifest
assert 'web_accessible_resources' not in manifest
assert "connect-src 'none'" in manifest['content_security_policy']['extension_pages']
assert "img-src 'self'" in manifest['content_security_policy']['extension_pages']
assert manifest['side_panel']['default_path'] == 'sidepanel.html'
assert manifest['background']['service_worker'] == 'background.js'
source = '\n'.join((ROOT / file).read_text(encoding='utf-8') for file in ('sidepanel.js', 'background.js'))
# Comments/documentation may mention these APIs; inspect call expressions only.
for pattern in [r'\bfetch\s*\(', r'\bXMLHttpRequest\s*\(', r'\bWebSocket\s*\(',
                r'\bsendBeacon\s*\(', r'\bchrome\.scripting\b', r'\beval\s*\(',
                r'\binnerHTML\s*=', r'\bchrome\.storage\b', r'\blocalStorage\s*\.']:
    assert not re.search(pattern, source), f'Forbidden call: {pattern}'
html = (ROOT / 'sidepanel.html').read_text(encoding='utf-8')
assert '<script src="sidepanel.js" defer>' in html
assert 'https://' not in html and 'http://' not in html
assert 'onerror=' not in html and 'onclick=' not in html
assert (ROOT / 'icons/icon128.png').exists()
print('OK: Manifest V3, least-privilege set, no external-code or outbound network calls detected')
