$ErrorActionPreference = 'SilentlyContinue'
$guid = '{7c2d1e54-8b6a-4f0e-9d3b-2a5f61c0e8a4}'
Remove-Item -Path "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$guid" -Recurse -Force
Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Remove-SmbShare -Name 'OMQMLite' -Force; Remove-Item -Recurse -Force '$env:ProgramData\OMQM-Lite'"
Write-Host 'Da go OM/QM Lite. Thoat han Excel roi mo lai.' -ForegroundColor Green
