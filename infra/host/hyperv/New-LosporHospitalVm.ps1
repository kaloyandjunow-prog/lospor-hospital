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

  Ubuntu's installer asks "Continue with autoinstall? (yes|no)" unless the word
  autoinstall is on its boot command line. So, after verifying Canonical's ISO,
  the kit writes a copy whose boot menu carries it (Windows' built-in IMAPI2
  image writer; the installer files themselves are unchanged) and installs from
  that: nothing is typed in the console. The copy erases the disk of any
  machine that boots from it without asking, so remove it together with the
  installation media once Ubuntu is installed, as printed at the end.
  -ConfirmInstall installs from Canonical's ISO as it is, and the installer then
  asks once. If the Windows imaging components are missing (some Server Core
  installations), the kit falls back to that and says so.

  The installation takes about 15 to 20 minutes and restarts. Then log in as
  lospor (initial password lospor, which must be changed) and accept the offer
  to install LOSPOR. SSH accepts the key given with -AuthorizedKeyPath only
  after that first console login has changed the password.

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
  # The defaults meet the installer's readiness check: 8 cores, 16 GiB, and
  # 200 GiB still free once Ubuntu is installed.
  [ValidateRange(4, 256)] [int] $MemoryGB = 16,
  [ValidateRange(2, 64)] [int] $ProcessorCount = 8,
  [ValidateRange(80, 4096)] [int] $DiskGB = 256,
  [string] $VmDirectory,
  [switch] $EncryptDisk,
  [string] $AuthorizedKeyPath,
  [string] $SeedPath,
  # Build only the CIDATA seed disk and stop: for checking the seed, or for a
  # hypervisor that is set up by hand.
  [switch] $SeedOnly,
  # Install from Canonical's ISO unchanged; the installer then asks once.
  [switch] $ConfirmInstall
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

<#
  Write a copy of a verified Ubuntu server ISO whose boot menu adds
  `autoinstall` to the kernel command line, so the installer does not stop to
  ask. Everything else is copied unchanged, and the copy boots on UEFI (the
  only firmware a Generation 2 VM has) from the same signed shim and GRUB image,
  so Secure Boot is unaffected. Uses only components Windows ships: the disk
  image cmdlets, robocopy, and the IMAPI2 file system image writer.
#>
function New-AutoinstallIso([string] $SourceIso, [string] $OutIso, [string] $WorkDir) {
  if (-not ("LosporIsoStream" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class LosporIsoStream {
  public static void Save(object comStream, string path) {
    IStream stream = (IStream)comStream;
    byte[] buffer = new byte[4 * 1024 * 1024];
    IntPtr read = Marshal.AllocHGlobal(sizeof(int));
    try {
      using (FileStream output = File.Create(path)) {
        while (true) {
          stream.Read(buffer, buffer.Length, read);
          int count = Marshal.ReadInt32(read);
          if (count <= 0) break;
          output.Write(buffer, 0, count);
        }
      }
    } finally { Marshal.FreeHGlobal(read); }
  }
}
"@
  }

  # The UEFI boot image, from the El Torito boot catalog: the boot record at
  # sector 17 points to the catalog, whose EFI section entry gives the image's
  # position (in 2048-byte sectors) and length (in 512-byte sectors).
  $stream = [IO.File]::OpenRead($SourceIso)
  try {
    $sector = New-Object byte[] 2048
    $stream.Position = 17 * 2048
    [void] $stream.Read($sector, 0, 2048)
    if ([Text.Encoding]::ASCII.GetString($sector, 7, 23) -ne "EL TORITO SPECIFICATION") { throw "The ISO has no El Torito boot record." }
    $stream.Position = [int64] [BitConverter]::ToUInt32($sector, 71) * 2048
    [void] $stream.Read($sector, 0, 2048)
    $efiBytes = $null
    for ($i = 1; $i -lt 63; $i++) {
      $header = $i * 32
      if (($sector[$header] -eq 0x90 -or $sector[$header] -eq 0x91) -and $sector[$header + 1] -eq 0xEF) {
        $entry = $header + 32
        $efiBytes = New-Object byte[] ([BitConverter]::ToUInt16($sector, $entry + 6) * 512)
        $stream.Position = [int64] [BitConverter]::ToUInt32($sector, $entry + 8) * 2048
        [void] $stream.Read($efiBytes, 0, $efiBytes.Length)
        break
      }
    }
    if (-not $efiBytes -or $efiBytes.Length -eq 0) { throw "The ISO has no UEFI boot image." }
  } finally { $stream.Close() }

  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
  New-Item -ItemType Directory -Path $WorkDir | Out-Null
  $files = Join-Path $WorkDir "files"
  $mounted = Mount-DiskImage -ImagePath $SourceIso -PassThru
  try {
    $volume = $mounted | Get-Volume
    robocopy "$($volume.DriveLetter):\" $files /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the ISO's files failed (robocopy exit $LASTEXITCODE)." }
    $label = $volume.FileSystemLabel
  } finally {
    Dismount-DiskImage -ImagePath $SourceIso | Out-Null
  }
  Get-ChildItem -LiteralPath $files -Recurse -Force | ForEach-Object {
    $_.Attributes = $_.Attributes -band -bnot [IO.FileAttributes]::ReadOnly
  }

  $grub = Join-Path $files "boot\grub\grub.cfg"
  $menu = [IO.File]::ReadAllText($grub)
  $menu = $menu -replace "(?m)^(\s*linux\s+/casper/(?:hwe-)?vmlinuz)\s+---", '$1 autoinstall ---'
  $menu = $menu -replace "(?m)^set timeout=\d+", "set timeout=3"
  if ($menu -notmatch "(?m)^\s*linux\s+/casper/vmlinuz autoinstall ---") { throw "The ISO's boot menu is not the one this kit knows how to change." }
  [IO.File]::WriteAllText($grub, $menu, (New-Object System.Text.UTF8Encoding($false)))
  $efiImage = Join-Path $WorkDir "efi-boot.img"
  [IO.File]::WriteAllBytes($efiImage, $efiBytes)

  $image = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  $image.FileSystemsToCreate = 7   # ISO 9660, Joliet and UDF
  $image.VolumeName = ($label -replace "[^A-Za-z0-9_.-]", "_")
  $image.FreeMediaBlocks = 0       # no media size limit
  $image.Root.AddTree($files, $false)
  $bootImage = New-Object -ComObject ADODB.Stream
  $bootImage.Type = 1
  $bootImage.Open()
  $bootImage.LoadFromFile($efiImage)
  $boot = New-Object -ComObject IMAPI2FS.BootOptions
  $boot.PlatformId = 0xEF          # UEFI
  $boot.Emulation = 0              # no emulation
  $boot.AssignBootImage($bootImage)
  $image.BootImageOptions = $boot
  $result = $image.CreateResultImage()
  try {
    [LosporIsoStream]::Save($result.ImageStream, $OutIso)
  } finally {
    # IMAPI2 keeps every source file open until its COM objects are released,
    # so the working copy cannot be deleted before this.
    $bootImage.Close()
    foreach ($com in @($result, $boot, $bootImage, $image)) {
      [void] [Runtime.InteropServices.Marshal]::ReleaseComObject($com)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
  # The ISO is written; a working copy left behind is only disk space.
  Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
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
if (-not $SeedOnly -and ($MemoryGB -lt 16 -or $ProcessorCount -lt 8 -or $DiskGB -lt 256)) {
  Write-Warning "Below 16 GB memory, 8 processors or a 256 GB disk, the LOSPOR installer's readiness check refuses to install. Use smaller values only for a test."
}
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

# The ISO the VM boots: a copy that does not ask, unless -ConfirmInstall.
$bootIso = $IsoPath
$autoinstallIso = $null
if (-not $SeedOnly -and -not $ConfirmInstall) {
  $autoinstallIso = Join-Path $VmDirectory ([IO.Path]::GetFileNameWithoutExtension($isoName) + "-lospor-autoinstall.iso")
  if ($PSCmdlet.ShouldProcess($autoinstallIso, "Write an Ubuntu ISO that installs without asking")) {
    New-Item -ItemType Directory -Force -Path $VmDirectory | Out-Null
    try {
      Write-Host "Writing an installer ISO that does not stop to ask (a few minutes)..."
      New-AutoinstallIso -SourceIso $IsoPath -OutIso $autoinstallIso -WorkDir (Join-Path $VmDirectory "iso-build")
      $bootIso = $autoinstallIso
    } catch {
      Write-Warning "Could not write the installer ISO ($($_.Exception.Message)). Installing from Canonical's ISO instead: type yes when the installer asks 'Continue with autoinstall?'."
      Remove-Item -LiteralPath $autoinstallIso -Force -ErrorAction SilentlyContinue
      $autoinstallIso = $null
      Remove-Item -LiteralPath (Join-Path $VmDirectory "iso-build") -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
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
  $dvd = Add-VMDvdDrive -VM $vm -Path $bootIso -Passthru
  Add-VMHardDiskDrive -VM $vm -Path $seedDisk | Out-Null
  # The system disk first: empty, it falls through to the installer; once
  # installed, the reboot starts Ubuntu instead of offering to install again.
  $system = Get-VMHardDiskDrive -VM $vm | Where-Object { $_.Path -eq $systemDisk }
  Set-VMFirmware -VM $vm -BootOrder $system, $dvd
  Enable-VMIntegrationService -VM $vm -Name "Guest Service Interface" -ErrorAction SilentlyContinue
  Start-VM -VM $vm
  Write-Host ""
  Write-Host "The VM '$Name' is starting and installs Ubuntu on its own (about 15 to 20 minutes)."
  Write-Host "1. Open its console (vmconnect localhost `"$Name`") to watch."
  if ($autoinstallIso) {
    Write-Host "2. Nothing needs typing until Ubuntu has restarted to its login prompt."
  } else {
    Write-Host "2. A few minutes in, the installer asks 'Continue with autoinstall? (yes|no)'. Type yes."
  }
  Write-Host "3. Log in as lospor (password lospor, which you must change). SSH works after this."
  Write-Host "4. Accept the offer to install LOSPOR Hospital."
  Write-Host "Afterwards, remove the installation media:"
  Write-Host "   Get-VMDvdDrive -VMName `"$Name`" | Remove-VMDvdDrive"
  Write-Host "   Get-VMHardDiskDrive -VMName `"$Name`" | Where-Object Path -eq `"$seedDisk`" | Remove-VMHardDiskDrive; Remove-Item `"$seedDisk`""
  if ($autoinstallIso) {
    Write-Host "   Remove-Item `"$autoinstallIso`"   # it erases the disk of any machine that boots from it"
  }
}
