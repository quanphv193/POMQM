# OM/QM Lite for Excel on Windows: registers a shared-folder add-in catalog that contains manifest.xml.
# The add-in itself is served from https://quanphv193.github.io/POMQM/ (needs internet).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$catalog = Join-Path $env:ProgramData 'OMQM-Lite\catalog'
$share = 'OMQMLite'
$guid = '{7c2d1e54-8b6a-4f0e-9d3b-2a5f61c0e8a4}'
try {
	if (-not (Test-Path (Join-Path $here 'manifest.xml'))) { throw 'Khong thay manifest.xml. Hay giai nen day du file zip roi chay lai.' }
	New-Item -ItemType Directory -Force -Path $catalog | Out-Null
	Copy-Item (Join-Path $here 'manifest.xml') (Join-Path $catalog 'omqm-lite.xml') -Force

	# 1) Shared folder (needs administrator once). Only the current user gets read access.
	$user = "$env:USERDOMAIN\$env:USERNAME"
	$cmd = "if (-not (Get-SmbShare -Name '$share' -ErrorAction SilentlyContinue)) { New-SmbShare -Name '$share' -Path '$catalog' -ReadAccess '$user' | Out-Null }"
	$p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd
	if (-not (Get-SmbShare -Name $share -ErrorAction SilentlyContinue)) { throw 'Chua tao duoc thu muc chia se (ban da bam No o hop thoai quyen quan tri?).' }

	# 2) Tell Office that this share is a trusted add-in catalog (current user only).
	$key = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$guid"
	New-Item -Path $key -Force | Out-Null
	New-ItemProperty -Path $key -Name Id -Value $guid -PropertyType String -Force | Out-Null
	New-ItemProperty -Path $key -Name Url -Value "\\$env:COMPUTERNAME\$share" -PropertyType String -Force | Out-Null
	New-ItemProperty -Path $key -Name Flags -Value 1 -PropertyType DWord -Force | Out-Null

	Write-Host ''
	Write-Host 'DA CAI XONG OM/QM Lite.' -ForegroundColor Green
	Write-Host '1. Thoat han Excel (dong het cua so) roi mo lai.'
	Write-Host '2. Excel: Insert (Chen) > Add-ins > My Add-ins (Add-in cua toi) > SHARED FOLDER > OM/QM Lite > Add.'
	Write-Host '3. Nut OM/QM Lite hien tren tab Home. Can co mang internet khi dung.'
} catch {
	Write-Host ''
	Write-Host ('LOI: ' + $_.Exception.Message) -ForegroundColor Red
	exit 1
}
