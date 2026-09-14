<#
.SYNOPSIS
  Release gate: build a new Hyper-V VM with the host kit, check it, and
  optionally install a release on it, timing every step.

.DESCRIPTION
  The host kit's own tests can only read its source, because CI has no Hyper-V.
  This runs the real thing on a maintainer's Hyper-V host, so the Windows to
  Ubuntu hand-off -- the part most sensitive to platform changes -- is proven
  before a release rather than by the first hospital to install it.

  1. Host.      infra/host/hyperv/New-LosporHospitalVm.ps1 with an SSH key, as
                a hospital would run it, waiting until it has removed the
                installation media and started the VM.
  2. Checks.    Over SSH as lospor: the key works without a console login, the
                one-time password works for sudo and is not expired, the kit's
                installer is on the VM byte for byte, Docker and the host
                services run, and no installation media are left attached.
  3. Appliance. Only with -ReleaseMedia (a signed release directory, as on the
                USB): copies it, runs the carried installer offline with every
                answer supplied, and requires an installed release and a
                passing `losporctl check`.

  The VM is removed at the end unless -Keep is given. Nothing leaves the
  machine: no push, no release, no switch is created (the kit refuses to).

  Run in an elevated PowerShell. Needs the OpenSSH client (ssh, scp).

.EXAMPLE
  .\scripts\hyperv-install-gate.ps1 -IsoPath E:\iso\ubuntu-24.04.5-live-server-amd64.iso -SshKeyPath $HOME\.ssh\lospor_gate

.EXAMPLE
  .\scripts\hyperv-install-gate.ps1 -IsoPath E:\iso\ubuntu-24.04.5-live-server-amd64.iso -SshKeyPath $HOME\.ssh\lospor_gate -ReleaseMedia E:\media\lospor-hospital-1.4.0 -Keep
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $IsoPath,
  # A private key; its .pub beside it is given to the kit.
  [Parameter(Mandatory = $true)] [string] $SshKeyPath,
  [string] $SwitchName = "Default Switch",
  [string] $Name = ("LOSPOR Gate " + (Get-Date -Format "yyyyMMdd-HHmm")),
  [ValidateRange(4, 256)] [int] $MemoryGB = 16,
  [ValidateRange(2, 64)] [int] $ProcessorCount = 8,
  [ValidateRange(80, 4096)] [int] $DiskGB = 256,
  [string] $ReleaseMedia,
  [string] $EvidencePath,
  [switch] $Keep
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$kit = Join-Path $root "infra\host\hyperv\New-LosporHospitalVm.ps1"
$steps = New-Object System.Collections.Generic.List[object]
$gateStarted = Get-Date
$vmCreated = $false
$sshOptions = @("-i", $SshKeyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=10")
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Step([string] $Title, [scriptblock] $Body) {
  Write-Host ""
  Write-Host "== $Title"
  $started = Get-Date
  try {
    $result = & $Body
    $steps.Add([pscustomobject] @{ Step = $Title; Minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1); Result = "passed" })
    return $result
  } catch {
    $steps.Add([pscustomobject] @{ Step = $Title; Minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1); Result = "FAILED: $($_.Exception.Message)" })
    throw
  }
}

# A native command, judged by its exit code. Windows PowerShell 5.1 turns a
# native program's stderr into errors, which "Stop" would treat as a failure.
function Invoke-Native([string] $File, [string[]] $Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $File @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    return $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
}

<#
  Run a shell script on the VM as lospor. The script and its standard input are
  copied as files, byte for byte, rather than passed as arguments: Windows
  PowerShell 5.1 mangles double quotes in native arguments and ends piped text
  with CRLF. The copies are removed whatever the script does.
#>
function Invoke-VmScript([string] $Address, [string] $Script, [string] $StandardInput = "") {
  $local = Join-Path $env:TEMP ("lospor-gate-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $local | Out-Null
  try {
    [IO.File]::WriteAllText((Join-Path $local "step.sh"), (("set -eu`n" + $Script) -replace "`r`n", "`n"), $utf8)
    [IO.File]::WriteAllText((Join-Path $local "input"), ($StandardInput -replace "`r`n", "`n"), $utf8)
    if ((Invoke-Native ssh ($sshOptions + @("lospor@$Address", "rm -rf .lospor-gate && mkdir -m 700 .lospor-gate"))) -ne 0) { throw "cannot prepare the VM for a step" }
    if ((Invoke-Native scp ($sshOptions + @((Join-Path $local "step.sh"), (Join-Path $local "input"), "lospor@${Address}:.lospor-gate/"))) -ne 0) { throw "cannot copy a step to the VM" }
  } finally { Remove-Item -LiteralPath $local -Recurse -Force }
  $code = Invoke-Native ssh ($sshOptions + @("lospor@$Address", "sh .lospor-gate/step.sh < .lospor-gate/input; code=`$?; rm -rf .lospor-gate; exit `$code"))
  if ($code -ne 0) { throw "a step on the VM failed (exit $code)" }
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run this in an elevated PowerShell." }
foreach ($path in @($IsoPath, $SshKeyPath, "$SshKeyPath.pub", $kit)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Not found: $path" }
}
if ($ReleaseMedia -and -not (Get-ChildItem -LiteralPath $ReleaseMedia -Filter "lospor-hospital-*-release.lock")) {
  throw "$ReleaseMedia holds no lospor-hospital-*-release.lock."
}

$verdict = "FAILED"
try {
  # ── 1. Host ────────────────────────────────────────────────────────────────
  $password = Step "Create the VM with the host kit" {
    $script:vmCreated = $true
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $lines = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $kit -Name $Name -SwitchName $SwitchName `
        -IsoPath $IsoPath -AuthorizedKeyPath "$SshKeyPath.pub" -MemoryGB $MemoryGB -ProcessorCount $ProcessorCount -DiskGB $DiskGB 2>&1 |
        ForEach-Object { Write-Host $_; "$_" }
      $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "the host kit failed (exit $code)" }
    if (($lines -join "`n") -notmatch "One-time password: ([a-z0-9-]+)") { throw "the host kit showed no one-time password" }
    $Matches[1]
  }

  $address = Step "Reach the VM over SSH with the key alone" {
    $vm = Get-VM -Name $Name
    $mac = (($vm.NetworkAdapters | Select-Object -First 1).MacAddress -split "(..)" | Where-Object { $_ }) -join "-"
    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
      $candidates = @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.LinkLayerAddress -eq $mac } | ForEach-Object { $_.IPAddress })
      $candidates += @((Get-VM -Name $Name).NetworkAdapters.IPAddresses | Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" })
      foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ((Invoke-Native ssh ($sshOptions + @("lospor@$candidate", "true"))) -eq 0) { return $candidate }
      }
      Start-Sleep -Seconds 15
    }
    throw "no SSH answer from the VM within 10 minutes"
  }
  Write-Host "VM address: $address"

  # ── 2. Checks ──────────────────────────────────────────────────────────────
  Step "Check the installation media are gone" {
    $vm = Get-VM -Name $Name
    if (@(Get-VMDvdDrive -VM $vm).Count -ne 0) { throw "a DVD drive is still attached" }
    $disks = @(Get-VMHardDiskDrive -VM $vm)
    if ($disks.Count -ne 1) { throw "the seed disk is still attached" }
    $directory = Split-Path -Parent $disks[0].Path
    if (Get-ChildItem -LiteralPath $directory -Filter "*.iso") { throw "the installer ISO copy was not deleted" }
    if (Test-Path -LiteralPath (Join-Path $directory "lospor-seed.vhdx")) { throw "the seed disk was not deleted" }
  } | Out-Null

  Step "Check the host the seed prepared" {
    $bootstrap = $utf8.GetBytes(([IO.File]::ReadAllText((Join-Path $root "scripts\losporctl-install.sh")) -replace "`r`n", "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $expected = -join ($sha.ComputeHash($bootstrap) | ForEach-Object { $_.ToString("x2") }) } finally { $sha.Dispose() }
    Invoke-VmScript $address @"
sudo -S -p '' -v
test "`$(sha256sum /usr/local/lib/lospor/losporctl-install.sh | cut -d' ' -f1)" = $expected
test -f /etc/profile.d/lospor-first-login.sh
if LC_ALL=C chage -l lospor | grep -q 'password must be changed'; then echo 'the one-time password is expired' >&2; exit 1; fi
docker version --format '{{.Server.Version}}' >/dev/null
docker compose version --short >/dev/null
for unit in docker containerd systemd-timesyncd unattended-upgrades; do systemctl is-active --quiet "`$unit"; done
echo host checks passed
"@ "$password`n"
  } | Out-Null

  # ── 3. Appliance ───────────────────────────────────────────────────────────
  if ($ReleaseMedia) {
    Step "Copy the release media" {
      if ((Invoke-Native scp ($sshOptions + @("-r", $ReleaseMedia, "lospor@${address}:media"))) -ne 0) { throw "copying the release media failed" }
    } | Out-Null

    Step "Install the release with the carried installer, offline" {
      $admin = "Gate-" + [guid]::NewGuid().ToString("N").Substring(0, 20) + "!a1"
      # The first line unlocks sudo; the wizard then reads the administrator
      # password twice from what remains.
      Invoke-VmScript $address @"
IFS= read -r unlock
printf '%s\n' "`$unlock" | sudo -S -p '' -v
unset unlock
sudo -n env LOSPOR_DEFAULT_LOCALE=en HOSPITAL_INSTALL_SUPPLY_MODE=offline HOSPITAL_TLS_MODE=local \
  HOSPITAL_CLINICAL_DOMAIN=lospor.gate.invalid HOSPITAL_RESEARCH_DOMAIN=research.gate.invalid \
  HOSPITAL_INSTITUTION_NAME=Gate HOSPITAL_INSTITUTION_CITY=Sofia HOSPITAL_BOOTSTRAP_ADMIN_EMAIL=gate@lospor.invalid \
  HOSPITAL_BOOTSTRAP_ADMIN_USERNAME=gate.admin HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME=Gate HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME=Run \
  sh /usr/local/lib/lospor/losporctl-install.sh --media "`$HOME/media"
"@ "$password`n$admin`n$admin`n"
    } | Out-Null

    Step "Check the installed appliance" {
      Invoke-VmScript $address @"
sudo -S -p '' -v
sudo -n test -e /opt/lospor-hospital/.data/installed-release.tsv
sudo -n losporctl check
if sudo -n sh /usr/local/lib/lospor/losporctl-install.sh --discard-unfinished --yes; then echo 'an installed appliance was offered for discarding' >&2; exit 1; fi
echo appliance checks passed
"@ "$password`n"
    } | Out-Null
  }
  $verdict = "PASSED"
} catch {
  Write-Host ""
  Write-Host "Gate failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  Write-Host ""
  Write-Host "== $verdict in $([math]::Round(((Get-Date) - $gateStarted).TotalMinutes, 1)) minutes"
  $steps | Format-Table -AutoSize | Out-String | Write-Host
  if ($EvidencePath) {
    [pscustomobject] @{
      verdict = $verdict; vm = $Name; iso = (Split-Path -Leaf $IsoPath); releaseMedia = $ReleaseMedia
      startedAt = $gateStarted.ToUniversalTime().ToString("o"); steps = $steps
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Host "Evidence written to $EvidencePath"
  }
  if ($vmCreated -and -not $Keep -and (Get-VM -Name $Name -ErrorAction SilentlyContinue)) {
    $disk = Get-VMHardDiskDrive -VMName $Name | Select-Object -First 1
    Stop-VM -Name $Name -TurnOff -Force -ErrorAction SilentlyContinue
    Remove-VM -Name $Name -Force
    if ($disk -and (Test-Path -LiteralPath (Split-Path -Parent $disk.Path))) { Remove-Item -LiteralPath (Split-Path -Parent $disk.Path) -Recurse -Force }
    Write-Host "The gate VM '$Name' was removed. Use -Keep to look at it afterwards."
  }
}
if ($verdict -ne "PASSED") { exit 1 }
