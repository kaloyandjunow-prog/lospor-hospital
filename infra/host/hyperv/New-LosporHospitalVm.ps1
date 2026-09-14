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

  Ubuntu installs in about 15 to 20 minutes and then switches the VM off. The
  kit waits for that, removes the installation media (the ISO copy erases any
  machine that boots from it), and starts the VM. -NoWait leaves those steps to
  you and prints them.

  The console user is lospor, with a one-time password the kit makes for this
  VM and shows once. It must be changed at the first console login, unless an
  SSH key is given with -AuthorizedKeyPath: then SSH works at once, and the
  password is only for sudo until you change it.

  The LOSPOR installer (scripts/losporctl-install.sh from the same release) is
  carried onto the VM, so the first login offers a copy that came with this kit
  rather than downloading one. Copy the whole unpacked release folder to the
  Hyper-V host, not only infra\host.

  These scripts are not code-signed. After copying the release folder to the
  Hyper-V host, unblock them once in an elevated PowerShell:
  Get-ChildItem .\infra\host -Recurse -Filter *.ps1 | Unblock-File

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
  # The release's own installer; found beside infra\host in the release folder.
  [string] $BootstrapPath,
  # Build only the CIDATA seed disk and stop: for checking the seed, or for a
  # hypervisor that is set up by hand.
  [switch] $SeedOnly,
  # Install from Canonical's ISO unchanged; the installer then asks once.
  [switch] $ConfirmInstall,
  # Start the installation and return, instead of waiting to remove the media.
  [switch] $NoWait,
  [ValidateRange(20, 600)] [int] $InstallTimeoutMinutes = 120
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "LosporHostKit.ps1")

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
  Remove the VM's DVD drives through Hyper-V's WMI provider.

  Ubuntu ejects the disc as it switches off, and Remove-VMDvdDrive then fails
  with "cannot be found": it looks for the ejected media first, and loading the
  disc again does not help either (both seen on a real run and reproduced on a
  throwaway VM). Removing the media and drive settings directly works whether
  the disc was ejected or not.
#>
function Remove-LosporDvdDrives([string] $VmName) {
  $namespace = "root\virtualization\v2"
  $computer = Get-WmiObject -Namespace $namespace -Class Msvm_ComputerSystem -Filter "ElementName='$($VmName.Replace("'", "''"))'"
  $service = Get-WmiObject -Namespace $namespace -Class Msvm_VirtualSystemManagementService
  $settings = { $computer.GetRelated("Msvm_VirtualSystemSettingData") | Where-Object { $_.VirtualSystemType -eq "Microsoft:Hyper-V:System:Realized" } }
  $media = @((& $settings).GetRelated("Msvm_StorageAllocationSettingData") | Where-Object { $_.ResourceSubType -eq "Microsoft:Hyper-V:Virtual CD/DVD Disk" })
  $drives = @((& $settings).GetRelated("Msvm_ResourceAllocationSettingData") | Where-Object { $_.ResourceSubType -eq "Microsoft:Hyper-V:Synthetic DVD Drive" })
  foreach ($item in ($media + $drives)) {
    # 0 is done, 4096 is a job Hyper-V finishes on its own.
    $result = $service.RemoveResourceSettings(@($item.__PATH)).ReturnValue
    if ($result -ne 0 -and $result -ne 4096) { Stop-Kit "Hyper-V would not remove the installation DVD (error $result). Remove it in Hyper-V Manager." }
  }
  for ($i = 0; $i -lt 30; $i++) {
    if (@((& $settings).GetRelated("Msvm_ResourceAllocationSettingData") | Where-Object { $_.ResourceSubType -eq "Microsoft:Hyper-V:Synthetic DVD Drive" }).Count -eq 0) { return }
    Start-Sleep -Seconds 1
  }
  Stop-Kit "The installation DVD drive is still attached. Remove it in Hyper-V Manager before starting the VM."
}

# Whether Ubuntu's installer finished: its last step writes lospor-installed
# onto the seed disk. Read only once the VM is off, so nothing else holds it.
function Test-LosporInstalledMark([string] $Disk) {
  $mounted = Mount-VHD -Path $Disk -Passthru
  try {
    $number = ($mounted | Get-Disk).Number
    $partition = Get-Partition -DiskNumber $number | Select-Object -First 1
    if (-not $partition.DriveLetter) {
      Add-PartitionAccessPath -DiskNumber $number -PartitionNumber $partition.PartitionNumber -AssignDriveLetter
      $partition = Get-Partition -DiskNumber $number -PartitionNumber $partition.PartitionNumber
    }
    return (Test-Path -LiteralPath "$($partition.DriveLetter):\lospor-installed" -PathType Leaf)
  } finally {
    Dismount-VHD -Path $Disk
  }
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
# infra\host\hyperv is three levels below the release folder that holds scripts.
if (-not $BootstrapPath) { $BootstrapPath = Join-Path $PSScriptRoot "..\..\..\scripts\losporctl-install.sh" }
if (-not (Test-Path -LiteralPath $BootstrapPath -PathType Leaf)) {
  Stop-Kit "The LOSPOR installer was not found at $BootstrapPath. Copy the whole unpacked release folder to this host: it holds infra\host and scripts."
}
$bootstrap = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $BootstrapPath).Path)
if (-not $bootstrap.StartsWith("#!/bin/sh") -or -not $bootstrap.Contains("LOSPOR_RELEASE_SIGNING_PUBLIC_KEY=")) {
  Stop-Kit "$BootstrapPath is not the LOSPOR installer."
}

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

# The passphrase and the key are read here; composing the seed is in
# LosporHostKit.ps1, where it can be tested without Hyper-V.
$diskPassphrase = $null
if ($EncryptDisk) {
  $first = Read-Host -AsSecureString "Disk encryption passphrase (at least 16 characters)"
  $second = Read-Host -AsSecureString "Repeat the passphrase"
  $diskPassphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
  $repeat = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
  if ($diskPassphrase -ne $repeat) { Stop-Kit "The passphrases differ." }
  if ($diskPassphrase.Length -lt 16 -or $diskPassphrase.Contains('"') -or $diskPassphrase.Contains('\')) {
    Stop-Kit "Use at least 16 characters, without quotes or backslashes."
  }
  Write-Warning "The passphrase is on the seed disk until the kit deletes it. Keep it in the hospital's escrow; without it the server cannot boot."
}
$key = $null
if ($AuthorizedKeyPath) {
  $key = (Get-Content -Raw -LiteralPath $AuthorizedKeyPath).Trim()
  if ($key -notmatch '^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( [^"\r\n]*)?$') { Stop-Kit "$AuthorizedKeyPath is not a single OpenSSH public key." }
}

# A password for this VM alone. Only its hash goes onto the seed disk.
$oneTimePassword = New-LosporOneTimePassword
$composed = ConvertTo-LosporSeed -Seed (Get-Content -Raw -LiteralPath $SeedPath) -Bootstrap $bootstrap `
  -PasswordHash (ConvertTo-LosporSha512Crypt $oneTimePassword) -AuthorizedKey $key -DiskPassphrase $diskPassphrase
$seed = $composed.Text
if (-not $composed.CarriesBootstrap) { Write-Warning "The seed at $SeedPath has no place for the LOSPOR installer; the VM will not carry it." }
if (-not $composed.SetsPassword) {
  Write-Warning "The seed at $SeedPath sets its own console password."
  $oneTimePassword = $null
}

function Show-LosporLogin {
  Write-Host ""
  if ($oneTimePassword) {
    Write-Host "Console user:      lospor"
    Write-Host "One-time password: $oneTimePassword"
    if ($AuthorizedKeyPath) {
      Write-Host "SSH with your key works as soon as the VM is up. The password is for sudo; change it with passwd."
    } else {
      Write-Host "The first console login asks for a new password."
    }
    Write-Host "Note it now: it is not stored anywhere and is not shown again."
  }
  if ($EncryptDisk) { Write-Host "At every start the VM console asks for the disk encryption passphrase." }
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
  Show-LosporLogin
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
  $started = Get-Date
  $manual = @(
    # Not Remove-VMDvdDrive: it fails once Ubuntu has ejected the disc.
    "   In Hyper-V Manager: $Name > Settings > SCSI Controller > DVD Drive > Remove",
    "   Get-VMHardDiskDrive -VMName `"$Name`" | Where-Object Path -eq `"$seedDisk`" | Remove-VMHardDiskDrive; Remove-Item `"$seedDisk`""
  )
  if ($autoinstallIso) { $manual += "   Remove-Item `"$autoinstallIso`"   # it erases the disk of any machine that boots from it" }
  $manual += "   Start-VM -Name `"$Name`""

  Write-Host ""
  Write-Host "The VM '$Name' is installing Ubuntu on its own (about 15 to 20 minutes)."
  Write-Host "Watch it with: vmconnect localhost `"$Name`""
  if (-not $autoinstallIso) {
    Write-Host "A few minutes in, the installer asks 'Continue with autoinstall? (yes|no)'. Type yes."
  }
  # Shown before any waiting, so closing this window cannot lose it.
  Show-LosporLogin
  Write-Host ""
  if ($NoWait) {
    Write-Host "When the VM has switched off, remove the installation media and start it:"
    $manual | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "This window waits for Ubuntu to finish, removes the installation media and starts the VM."
    Write-Host "If you close it, do this yourself once the VM has switched off:"
    $manual | ForEach-Object { Write-Host $_ }
    $deadline = $started.AddMinutes($InstallTimeoutMinutes)
    while ((Get-VM -Name $Name).State -ne "Off") {
      if ((Get-Date) -gt $deadline) {
        Stop-Kit "Ubuntu had not finished after $InstallTimeoutMinutes minutes. Nothing was removed; look at the VM console."
      }
      Start-Sleep -Seconds 20
    }
    if (-not (Test-LosporInstalledMark $seedDisk)) {
      Stop-Kit "The VM switched off before Ubuntu recorded a finished installation. Nothing was removed; look at the VM console."
    }
    Remove-LosporDvdDrives $Name
    Get-VMHardDiskDrive -VMName $Name | Where-Object { $_.Path -eq $seedDisk } | Remove-VMHardDiskDrive
    Remove-Item -LiteralPath $seedDisk -Force
    if ($autoinstallIso) { Remove-Item -LiteralPath $autoinstallIso -Force }
    Start-VM -VM $vm
    Write-Host ""
    Write-Host "Ubuntu is installed ($([int] ((Get-Date) - $started).TotalMinutes) minutes). The installation media are removed and the VM is starting."
    Show-LosporLogin
  }
  Write-Host "Log in on the VM console and accept the offer to install LOSPOR Hospital."
}
