param(
  [switch]$SkipNodeCheck
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$errors = [System.Collections.Generic.List[string]]::new()

function Add-ValidationError {
  param([string]$Message)
  $script:errors.Add($Message) | Out-Null
}

function Test-RequiredFile {
  param([string]$RelativePath)

  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Missing required file: $RelativePath"
  }
}

function Get-PngDimension {
  param(
    [byte[]]$Bytes,
    [int]$Offset
  )

  return (($Bytes[$Offset] -shl 24) -bor
    ($Bytes[$Offset + 1] -shl 16) -bor
    ($Bytes[$Offset + 2] -shl 8) -bor
    $Bytes[$Offset + 3])
}

function Test-PngIcon {
  param(
    [string]$RelativePath,
    [int]$ExpectedSize
  )

  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-ValidationError "Missing icon: $RelativePath"
    return
  }

  $bytes = [System.IO.File]::ReadAllBytes($path)
  $signature = [byte[]](0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if ($bytes.Length -lt 24) {
    Add-ValidationError "Icon is too small to be a valid PNG: $RelativePath"
    return
  }

  for ($i = 0; $i -lt $signature.Length; $i++) {
    if ($bytes[$i] -ne $signature[$i]) {
      Add-ValidationError "Icon is not a PNG file: $RelativePath"
      return
    }
  }

  $width = Get-PngDimension -Bytes $bytes -Offset 16
  $height = Get-PngDimension -Bytes $bytes -Offset 20
  if ($width -ne $ExpectedSize -or $height -ne $ExpectedSize) {
    Add-ValidationError "Icon has unexpected dimensions: $RelativePath ($width x $height, expected $ExpectedSize x $ExpectedSize)"
  }
}

function Test-JavaScriptSyntax {
  param([string[]]$RelativePaths)

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    if ($SkipNodeCheck) {
      Write-Warning 'Node.js was not found; JavaScript syntax checks skipped (-SkipNodeCheck).'
      return
    }
    Add-ValidationError 'Node.js was not found. Install Node.js, or pass -SkipNodeCheck to explicitly skip JS syntax checks.'
    return
  }

  foreach ($relativePath in $RelativePaths) {
    $path = Join-Path $root $relativePath
    $output = & $node.Source --check $path 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-ValidationError "JavaScript syntax check failed for $relativePath`n$output"
    }
  }
}

function Test-PowerShellSyntax {
  param([string[]]$RelativePaths)

  foreach ($relativePath in $RelativePaths) {
    $path = Join-Path $root $relativePath
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($parseError in $parseErrors) {
      Add-ValidationError "PowerShell syntax check failed for $relativePath`: $($parseError.Message)"
    }
  }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'manifest.json is missing.'
}

try {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
} catch {
  throw "manifest.json is not valid JSON: $($_.Exception.Message)"
}

if ($manifest.manifest_version -ne 3) {
  Add-ValidationError 'manifest_version must be 3.'
}
if (-not $manifest.name) {
  Add-ValidationError 'manifest.name is required.'
}
if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') {
  Add-ValidationError "manifest.version must use x.y.z format: $($manifest.version)"
}
if (-not $manifest.default_locale) {
  Add-ValidationError 'manifest.default_locale is required (localized manifest uses __MSG_ placeholders).'
}
if (-not $manifest.background.service_worker) {
  Add-ValidationError 'background.service_worker is required.'
}
if ($manifest.side_panel.default_path -ne 'sidepanel.html') {
  Add-ValidationError 'side_panel.default_path must be sidepanel.html.'
}

$permissions = @($manifest.permissions)
$expectedPermissions = @('sidePanel', 'tabs', 'tabGroups', 'favicon')
foreach ($permission in $expectedPermissions) {
  if ($permissions -notcontains $permission) {
    Add-ValidationError "Missing manifest permission: $permission"
  }
}
foreach ($permission in $permissions) {
  if ($expectedPermissions -notcontains $permission) {
    Add-ValidationError "Unexpected manifest permission (least-privilege set): $permission"
  }
}
if ($manifest.host_permissions) {
  Add-ValidationError 'host_permissions must stay absent for this extension.'
}

$contentScripts = @($manifest.content_scripts)
$csJs = @($contentScripts[0].js)
if ($contentScripts.Count -ne 1 -or $csJs.Count -ne 1 -or $csJs[0] -ne 'rail.js') {
  Add-ValidationError "content_scripts must be exactly one entry injecting rail.js only."
}
if ($contentScripts[0].run_at -ne 'document_idle' -or $contentScripts[0].all_frames -ne $false) {
  Add-ValidationError 'content_scripts must run at document_idle with all_frames=false.'
}
foreach ($match in @($contentScripts[0].matches)) {
  if (@('http://*/*', 'https://*/*', 'file:///*') -notcontains $match) {
    Add-ValidationError "Unexpected content_scripts match: $match"
  }
}

$wars = @($manifest.web_accessible_resources)
$warRes = @($wars[0].resources)
if ($wars.Count -ne 1 -or $warRes.Count -ne 1 -or $warRes[0] -ne '_favicon/*') {
  Add-ValidationError "web_accessible_resources must expose only _favicon/*."
}
if ($manifest.content_security_policy.extension_pages -notmatch "connect-src 'none'") {
  Add-ValidationError "CSP extension_pages must include connect-src 'none'."
}

$requiredFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
  'manifest.json',
  'background.js',
  'rail.js',
  'rail-config.js',
  'sidepanel.html',
  'sidepanel.js',
  'styles.css',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'scripts/package-webstore.ps1',
  'scripts/validate-extension.ps1',
  'tests/security-check.py'
) | ForEach-Object { $requiredFiles.Add($_) | Out-Null }
$requiredFiles.Add([string]$manifest.background.service_worker) | Out-Null
$requiredFiles.Add([string]$manifest.side_panel.default_path) | Out-Null

$iconEntries = @{}
foreach ($property in $manifest.icons.PSObject.Properties) {
  $iconEntries[$property.Name] = [string]$property.Value
}
if ($manifest.action.default_icon) {
  foreach ($property in $manifest.action.default_icon.PSObject.Properties) {
    $iconEntries[$property.Name] = [string]$property.Value
  }
}
foreach ($iconPath in $iconEntries.Values) {
  $requiredFiles.Add($iconPath) | Out-Null
}
foreach ($file in $requiredFiles) {
  Test-RequiredFile $file
}

foreach ($entry in $iconEntries.GetEnumerator()) {
  $size = 0
  if ([int]::TryParse($entry.Key, [ref]$size)) {
    Test-PngIcon -RelativePath $entry.Value -ExpectedSize $size
  }
}

# _locales/<code>/messages.json と実行時カタログ i18n/<code>.js の突合。
# default_locale 必須・全ロケール key parity・i18n ミラーは内容一致・manifest の __MSG_ 解決を確認。
$localesDir = Join-Path $root '_locales'
if (-not (Test-Path -LiteralPath $localesDir -PathType Container)) {
  Add-ValidationError '_locales/ directory is required for localized manifest.'
} else {
  $localeJson = @{}
  foreach ($dir in Get-ChildItem -LiteralPath $localesDir -Directory) {
    $messagesPath = Join-Path $dir.FullName 'messages.json'
    if (-not (Test-Path -LiteralPath $messagesPath -PathType Leaf)) {
      Add-ValidationError "Missing _locales/$($dir.Name)/messages.json"
      continue
    }
    try {
      $localeJson[$dir.Name] = Get-Content -Raw -LiteralPath $messagesPath | ConvertFrom-Json
    } catch {
      Add-ValidationError "_locales/$($dir.Name)/messages.json is not valid JSON: $($_.Exception.Message)"
    }
  }
  if ($manifest.default_locale -and -not $localeJson.ContainsKey($manifest.default_locale)) {
    Add-ValidationError "default_locale '$($manifest.default_locale)' has no _locales directory."
  }
  $refCode = $manifest.default_locale
  if ($localeJson.ContainsKey($refCode)) {
    $refKeys = @($localeJson[$refCode].PSObject.Properties.Name)
    foreach ($code in $localeJson.Keys) {
      $keys = @($localeJson[$code].PSObject.Properties.Name)
      foreach ($k in $refKeys) {
        if ($keys -notcontains $k) { Add-ValidationError "_locales/$code missing key: $k" }
      }
      foreach ($k in $keys) {
        if ($refKeys -notcontains $k) { Add-ValidationError "_locales/$code has extra key not in $refCode`: $k" }
      }
    }
    $manifestRaw = Get-Content -Raw -LiteralPath $manifestPath
    foreach ($match in [regex]::Matches($manifestRaw, '__MSG_(\w+)__')) {
      $key = $match.Groups[1].Value
      if ($refKeys -notcontains $key) {
        Add-ValidationError "manifest references __MSG_${key}__ but $refCode catalog lacks it."
      }
    }
  }
  # i18n/<code>.js は messages.json の実行時ミラー（言語切替用）。MANY_TABS_MSGS.<code> が
  # messages.json と deep-equal であることを node で確認する
  $i18nDir = Join-Path $root 'i18n'
  $node = Get-Command node -ErrorAction SilentlyContinue
  foreach ($code in $localeJson.Keys) {
    $catalogPath = Join-Path $i18nDir "$code.js"
    if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
      Add-ValidationError "Missing runtime catalog: i18n/$code.js (required for the language switcher)"
      continue
    }
    if ($node) {
      $check = @"
const fs=require('fs');
const mj=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
globalThis.MANY_TABS_MSGS={};
new Function(fs.readFileSync(process.argv[2],'utf8'))();
const c=MANY_TABS_MSGS['$code'];
if(!c||JSON.stringify(c)!==JSON.stringify(mj)){console.error('MISMATCH');process.exit(1)}
"@
      $messagesPath = Join-Path $localesDir "$code\messages.json"
      $out = & $node.Source -e $check $messagesPath $catalogPath 2>&1
      if ($LASTEXITCODE -ne 0) {
        Add-ValidationError "i18n/$code.js is out of sync with _locales/$code/messages.json`n$out"
      }
    } else {
      Write-Warning "Node.js not found; i18n/$code.js parity check skipped."
    }
  }
}

$sidepanelHtml = Get-Content -Raw -LiteralPath (Join-Path $root 'sidepanel.html')
if ($sidepanelHtml -match '(?is)<script(?![^>]*\bsrc=)[^>]*>') {
  Add-ValidationError 'sidepanel.html must not contain inline scripts.'
}
if ($sidepanelHtml -match '(?is)\son[a-z]+\s*=') {
  Add-ValidationError 'sidepanel.html must not contain inline event handlers.'
}
if ($sidepanelHtml -match '(?is)<(?:script|link|img|iframe|object|embed)[^>]+(?:src|href)\s*=\s*["'']https?://') {
  Add-ValidationError 'sidepanel.html must not load remote resources.'
}
if ($sidepanelHtml -notmatch '<script[^>]+src="sidepanel\.js"') {
  Add-ValidationError 'sidepanel.html must load sidepanel.js.'
}

$changelog = Get-Content -Raw -LiteralPath (Join-Path $root 'CHANGELOG.md')
$versionHeading = "## [$($manifest.version)]"
if (-not $changelog.Contains($versionHeading) -and $changelog -notmatch '(?m)^## \[Unreleased\]') {
  Add-ValidationError "CHANGELOG.md must contain $versionHeading or an Unreleased section."
}

$jsFiles = @('background.js', 'rail.js', 'rail-config.js', 'sidepanel.js')
$i18nDirPath = Join-Path $root 'i18n'
if (Test-Path -LiteralPath $i18nDirPath -PathType Container) {
  $jsFiles += Get-ChildItem -LiteralPath $i18nDirPath -Filter '*.js' | ForEach-Object { "i18n/$($_.Name)" }
}
Test-JavaScriptSyntax $jsFiles
Test-PowerShellSyntax @('scripts/package-webstore.ps1', 'scripts/validate-extension.ps1')

# tests/security-check.py（禁止 API・権限・CSP・content_scripts 宣言の静的検査）。
# プライバシーポリシーで「変更時に機械チェック」と書いている検査なので、Python が無ければ通さない
$python = @('python', 'python3', 'py') |
  ForEach-Object { Get-Command $_ -CommandType Application -ErrorAction SilentlyContinue } |
  Select-Object -First 1
if (-not $python) {
  Add-ValidationError 'Python was not found; tests/security-check.py must run before packaging.'
} else {
  $securityOut = & $python.Source (Join-Path $root 'tests/security-check.py') 2>&1
  if ($LASTEXITCODE -ne 0) {
    Add-ValidationError "tests/security-check.py failed`n$securityOut"
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host 'Extension validation passed.'
