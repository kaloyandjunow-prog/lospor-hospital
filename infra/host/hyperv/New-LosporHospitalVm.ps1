<#
.SYNOPSIS
  Create a Hyper-V virtual machine ready for LOSPOR Hospital.

.DESCRIPTION
  Checks that Hyper-V is available and that the named virtual switch already
  exists (this script never creates or changes a switch), verifies the Ubuntu
  24.04 server ISO against a SHA-256 compiled into this file (downloading the
  pinned release first if no ISO is given), builds the autoinstall seed as a
  small FAT32 disk labelled CIDATA with built-in Storage cmdlets, creates a
  Generation 2 VM with Secure Boot, attaches the ISO and the seed, and starts it.

  In the VM console the Ubuntu installer asks once:
  "Continue with autoinstall? (yes|no)". Type yes. The installation takes
  about 10 to 20 minutes and reboots. Then log in as lospor (initial password
  lospor, which must be changed) and accept the offer to install LOSPOR.

  This script is not code-signed. After copying it to the Hyper-V host, run
  Unblock-File on it once, in an elevated PowerShell.

  PowerShell 5.1 or later, Windows Server 2019/2022/2025 or Windows 10/11 with
  Hyper-V. Run elevated.

.EXAMPLE
  .\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -IsoPath D:\iso\ubuntu-24.04.5-live-server-amd64.iso

.EXAMPLE
  .\New-LosporHospitalVm.ps1 -SwitchName "Hospital LAN" -DownloadDirectory D:\iso -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string] $Name = "LOSPOR Hospital",
  [Parameter(Mandatory = $true)] [string] $SwitchName,
  [string] $IsoPath,
  [string] $DownloadDirectory,
  [ValidateRange(4, 256)] [int] $MemoryGB = 8,
  [ValidateRange(2, 64)] [int] $ProcessorCount = 4,
  [ValidateRange(80, 4096)] [int] $DiskGB = 200,
  [string] $VmDirectory,
  [switch] $EncryptDisk,
  [string] $AuthorizedKeyPath,
  [string] $SeedPath,
  # Build only the CIDATA seed disk and stop: for checking the seed, or for a
  # hypervisor that is set up by hand.
  [switch] $SeedOnly
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

# The Ubuntu releases this kit accepts, by the SHA-256 Canonical publishes in
# SHA256SUMS. Anything else is refused, however it was obtained.
$KnownIsos = @{
  "ubuntu-24.04.5-live-server-amd64.iso" = "97f3d7ffb032c3eb3b23d2c8be9cc76e60c2c1f2c0146ba5ba9fe01cafae0fd8"
  "ubuntu-24.04.4-live-server-amd64.iso" = "e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433"
}
$DownloadIso = "ubuntu-24.04.5-live-server-amd64.iso"
$DownloadUrl = "https://releases.ubuntu.com/24.04.5/$DownloadIso"

function Stop-Kit([string] $Message) {
  Write-Error $Message -ErrorAction Continue
  exit 1
}

# ── prerequisites ────────────────────────────────────────────────────────────

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Stop-Kit "Run this in an elevated PowerShell (Run as administrator)."
}
if (-not (Get-Module -ListAvailable -Name Hyper-V)) {
  Stop-Kit "The Hyper-V PowerShell module is not installed. Enable Hyper-V and its management tools first."
}
Import-Module Hyper-V
if (-not (Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue)) {
  $available = (Get-VMSwitch | ForEach-Object { $_.Name }) -join ", "
  Stop-Kit "The virtual switch '$SwitchName' does not exist. This script never creates switches. Available: $available"
}
if (Get-VM -Name $Name -ErrorAction SilentlyContinue) {
  Stop-Kit "A virtual machine named '$Name' already exists. Choose another -Name."
}
if (-not $VmDirectory) { $VmDirectory = Join-Path (Get-VMHost).VirtualMachinePath $Name }
if (-not $SeedPath) { $SeedPath = Join-Path $PSScriptRoot "..\autoinstall\user-data" }
if (-not (Test-Path -LiteralPath $SeedPath -PathType Leaf)) { Stop-Kit "The autoinstall seed was not found at $SeedPath." }

# ── the Ubuntu ISO ───────────────────────────────────────────────────────────

if ($SeedOnly) {
  if (-not $VmDirectory) { Stop-Kit "Give -VmDirectory for the seed disk." }
} elseif (-not $IsoPath) {
  if (-not $DownloadDirectory) { Stop-Kit "Give -IsoPath for an ISO you already have, or -DownloadDirectory to download $DownloadIso." }
  $IsoPath = Join-Path $DownloadDirectory $DownloadIso
  if (-not (Test-Path -LiteralPath $IsoPath)) {
    if ($PSCmdlet.ShouldProcess($DownloadUrl, "Download Ubuntu server ISO to $IsoPath")) {
      New-Item -ItemType Directory -Force -Path $DownloadDirectory | Out-Null
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $DownloadUrl -OutFile $IsoPath -UseBasicParsing
    }
  }
}
$isoName = if ($SeedOnly) { $null } else { Split-Path -Leaf $IsoPath }
if ($SeedOnly) {
  # No ISO is involved.
} elseif (-not $KnownIsos.ContainsKey($isoName)) {
  Stop-Kit "$isoName is not a release this kit accepts: $($KnownIsos.Keys -join ', ')."
}
if ($SeedOnly) {
  # Nothing to verify.
} elseif (Test-Path -LiteralPath $IsoPath) {
  Write-Host "Verifying $isoName (this reads the whole file)..."
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $IsoPath).Hash.ToLowerInvariant()
  if ($actual -ne $KnownIsos[$isoName]) {
    Stop-Kit "$isoName does not match Canonical's published SHA-256. Delete it and download it again."
  }
  Write-Host "The ISO matches Canonical's published SHA-256."
} elseif (-not $WhatIfPreference) {
  Stop-Kit "The ISO was not found at $IsoPath."
}

# ── the seed ─────────────────────────────────────────────────────────────────

$seed = Get-Content -Raw -LiteralPath $SeedPath
if ($EncryptDisk) {
  $first = Read-Host -AsSecureString "Disk encryption passphrase (at least 16 characters)"
  $second = Read-Host -AsSecureString "Repeat the passphrase"
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
  $repeat = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
  if ($plain -ne $repeat) { Stop-Kit "The passphrases differ." }
  if ($plain.Length -lt 16 -or $plain.Contains('"') -or $plain.Contains('\')) {
    Stop-Kit "Use at least 16 characters, without quotes or backslashes."
  }
  $layout = "    layout:`n      name: lvm`n      sizing-policy: all`n      password: `"$plain`""
  $seed = $seed -replace "    layout:\r?\n      name: lvm\r?\n      sizing-policy: all", $layout
  Write-Warning "The passphrase is on the seed disk until it is deleted. Keep it in the hospital's escrow; without it the server cannot boot."
}
if ($AuthorizedKeyPath) {
  $key = (Get-Content -Raw -LiteralPath $AuthorizedKeyPath).Trim()
  if ($key -notmatch '^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( [^"\r\n]*)?$') { Stop-Kit "$AuthorizedKeyPath is not a single OpenSSH public key." }
  $seed = $seed -replace "    authorized-keys: \[\]", "    authorized-keys:`n      - `"$key`""
}

$seedDisk = Join-Path $VmDirectory "lospor-seed.vhdx"
$systemDisk = Join-Path $VmDirectory "$Name.vhdx"

if ($PSCmdlet.ShouldProcess($seedDisk, "Create the CIDATA seed disk")) {
  New-Item -ItemType Directory -Force -Path $VmDirectory | Out-Null
  if (Test-Path -LiteralPath $seedDisk) { Remove-Item -LiteralPath $seedDisk -Force }
  New-VHD -Path $seedDisk -SizeBytes 64MB -Dynamic | Out-Null
  $mounted = Mount-VHD -Path $seedDisk -Passthru
  try {
    $disk = $mounted | Get-Disk
    Initialize-Disk -Number $disk.Number -PartitionStyle MBR
    $partition = New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter
    Format-Volume -Partition $partition -FileSystem FAT32 -NewFileSystemLabel CIDATA -Confirm:$false | Out-Null
    $root = "$($partition.DriveLetter):\"
    # cloud-init reads these byte for byte: LF line endings, no byte-order mark.
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $root "user-data"), ($seed -replace "`r`n", "`n"), $utf8)
    [IO.File]::WriteAllText((Join-Path $root "meta-data"), "", $utf8)
  } finally {
    Dismount-VHD -Path $seedDisk
  }
}

if ($SeedOnly) {
  Write-Host "Seed disk written to $seedDisk."
  exit 0
}

# ── the virtual machine ──────────────────────────────────────────────────────

if ($PSCmdlet.ShouldProcess($Name, "Create a Generation 2 VM ($MemoryGB GB, $ProcessorCount CPUs, $DiskGB GB) on '$SwitchName' and start it")) {
  $vm = New-VM -Name $Name -Generation 2 -MemoryStartupBytes ($MemoryGB * 1GB) `
    -NewVHDPath $systemDisk -NewVHDSizeBytes ($DiskGB * 1GB) -SwitchName $SwitchName -Path (Split-Path $VmDirectory)
  Set-VM -VM $vm -StaticMemory -ProcessorCount $ProcessorCount -AutomaticCheckpointsEnabled $false
  Set-VMFirmware -VM $vm -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority
  $dvd = Add-VMDvdDrive -VM $vm -Path $IsoPath -Passthru
  Add-VMHardDiskDrive -VM $vm -Path $seedDisk | Out-Null
  # The system disk first: empty, it falls through to the installer; once
  # installed, the reboot starts Ubuntu instead of offering to install again.
  $system = Get-VMHardDiskDrive -VM $vm | Where-Object { $_.Path -eq $systemDisk }
  Set-VMFirmware -VM $vm -BootOrder $system, $dvd
  Enable-VMIntegrationService -VM $vm -Name "Guest Service Interface" -ErrorAction SilentlyContinue
  Start-VM -VM $vm
  Write-Host ""
  Write-Host "The VM '$Name' is starting."
  Write-Host "1. Open its console (vmconnect localhost `"$Name`")."
  Write-Host "2. When the installer asks 'Continue with autoinstall? (yes|no)', type yes."
  Write-Host "3. After it reboots, log in as lospor (password lospor, which you must change)."
  Write-Host "4. Accept the offer to install LOSPOR Hospital."
  Write-Host "Afterwards, remove the installation media:"
  Write-Host "   Get-VMDvdDrive -VMName `"$Name`" | Remove-VMDvdDrive"
  Write-Host "   Get-VMHardDiskDrive -VMName `"$Name`" | Where-Object Path -eq `"$seedDisk`" | Remove-VMHardDiskDrive; Remove-Item `"$seedDisk`""
}
