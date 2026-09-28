<#
.SYNOPSIS
  Tests for hyperv-install-gate.ps1 (coverage review 1.4.13).

.DESCRIPTION
  The gate is the only proof that a release installs on Hyper-V, so what
  matters is that it never says PASSED when a check failed, and that it
  removes its VM unless told to keep it. It runs here for real, with the
  Hyper-V cmdlets, ssh, scp and the host kit replaced by stand-ins, so no VM
  is created and nothing leaves the machine.

  Windows only, in an elevated PowerShell -- the gate refuses anything else,
  and CI has neither. Run it where the gate itself is run:
    powershell -ExecutionPolicy Bypass -File scripts\hyperv-install-gate.test.ps1
#>
Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "hyperv-install-gate.ps1"
$failures = 0
function Pass([string] $Name) { Write-Host "PASS  $Name" }
function Fail([string] $Name) { $script:failures++; Write-Host "FAIL  $Name" -ForegroundColor Red }

# A copy of the gate in a scratch tree: the gate finds the kit and the
# installer beside itself.
$work = Join-Path $env:TEMP ("gate-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path (Join-Path $work "scripts"), (Join-Path $work "infra\host\hyperv"), (Join-Path $work "vm") | Out-Null
Copy-Item $source (Join-Path $work "scripts\hyperv-install-gate.ps1")
Set-Content (Join-Path $work "infra\host\hyperv\New-LosporHospitalVm.ps1") "# stand-in"
Set-Content (Join-Path $work "scripts\losporctl-install.sh") "#!/bin/sh`necho installer"
$iso = Join-Path $work "ubuntu.iso"; Set-Content $iso "iso"
$key = Join-Path $work "gate_key"; Set-Content $key "private"; Set-Content "$key.pub" "public"
$media = Join-Path $work "media"; New-Item -ItemType Directory -Path $media | Out-Null
$gate = Join-Path $work "scripts\hyperv-install-gate.ps1"

# ── Stand-ins. Functions come before cmdlets and programs, so the gate calls these.
$global:Scenario = @{}
$global:Calls = New-Object System.Collections.Generic.List[string]
function global:powershell.exe {
  $global:Calls.Add("kit $args")
  if ($global:Scenario["NoPassword"]) { "kit finished" } else { "One-time password: calm-river-42" }
  $global:LASTEXITCODE = 0
}
function global:ssh {
  $global:Calls.Add("ssh $args")
  $global:LASTEXITCODE = if ($global:Scenario["VmStepFails"] -and "$args" -match "step\.sh") { 1 } else { 0 }
}
function global:scp { $global:Calls.Add("scp $args"); $global:LASTEXITCODE = 0 }
function global:Start-Sleep { }
function global:Get-NetNeighbor { @() }
function global:Get-VM {
  param([string] $Name, $ErrorAction)
  if ($global:Scenario["Removed"]) { return $null }
  [pscustomobject] @{ Name = $Name; NetworkAdapters = @([pscustomobject] @{ MacAddress = "00155D0A0B0C"; IPAddresses = @("192.0.2.10") }) }
}
function global:Get-VMDvdDrive { param($VM) if ($global:Scenario["DvdLeft"]) { @([pscustomobject] @{ Path = "x.iso" }) } else { @() } }
function global:Get-VMHardDiskDrive {
  param($VM, [string] $VMName)
  $disk = [pscustomobject] @{ Path = (Join-Path $work "vm\disk.vhdx") }
  if ($global:Scenario["SeedLeft"]) { @($disk, [pscustomobject] @{ Path = (Join-Path $work "vm\lospor-seed.vhdx") }) } else { @($disk) }
}
function global:Stop-VM { $global:Calls.Add("Stop-VM") }
function global:Remove-VM { $global:Calls.Add("Remove-VM"); $global:Scenario["Removed"] = $true }

function Invoke-Gate([hashtable] $Scenario, [hashtable] $Extra = @{}) {
  $global:Scenario = $Scenario
  $global:Calls.Clear()
  New-Item -ItemType Directory -Force -Path (Join-Path $work "vm") | Out-Null
  # The gate deletes the VM's folder when it removes the VM; each run starts afresh.
  if ($Scenario["IsoLeft"]) { Set-Content (Join-Path $work "vm\leftover.iso") "iso" }
  if ($Scenario["SeedFileLeft"]) { Set-Content (Join-Path $work "vm\lospor-seed.vhdx") "seed" }
  $evidence = Join-Path $work "evidence.json"
  Remove-Item $evidence -ErrorAction SilentlyContinue
  $global:LASTEXITCODE = 0
  $arguments = @{ IsoPath = $iso; SshKeyPath = $key; Name = "Gate Test"; EvidencePath = $evidence } + $Extra
  $failed = $false
  try { & $gate @arguments *> $null } catch { $failed = $true }
  $code = $global:LASTEXITCODE
  $verdict = $null; $reason = $null
  if (Test-Path $evidence) {
    $record = Get-Content $evidence -Raw | ConvertFrom-Json
    $verdict = $record.verdict
    # Why it failed, in the gate's own words: failing for the wrong reason is not the check working.
    $reason = @($record.steps | Where-Object { $_.Result -like "FAILED*" } | ForEach-Object { $_.Result }) -join " "
  }
  [pscustomobject] @{ Code = $code; Threw = $failed; Verdict = $verdict; Reason = $reason; Calls = @($global:Calls) }
}
function Removed($result) { @($result.Calls | Where-Object { $_ -eq "Remove-VM" }).Count -eq 1 }

try {
  # 1. Every check passes: PASSED, exit 0, the VM removed, the one-time password never on a command line.
  $r = Invoke-Gate @{}
  if ($r.Verdict -eq "PASSED" -and $r.Code -eq 0 -and (Removed $r)) { Pass "a clean run passes and removes its VM" } else { Fail "a clean run: verdict $($r.Verdict), exit $($r.Code)" }
  if (@($r.Calls | Where-Object { $_ -like "ssh*" -or $_ -like "scp*" } | Where-Object { $_ -match "calm-river-42" }).Count -eq 0) { Pass "the one-time password is never an argument" } else { Fail "the one-time password was passed as an argument" }

  # 2. Each failed check fails the gate, and the VM is still removed.
  foreach ($case in @(
      @{ Name = "installation DVD still attached"; Scenario = @{ DvdLeft = $true }; Reason = "a DVD drive is still attached" },
      @{ Name = "seed disk still attached"; Scenario = @{ SeedLeft = $true }; Reason = "the seed disk is still attached" },
      @{ Name = "seed disk file left behind"; Scenario = @{ SeedFileLeft = $true }; Reason = "the seed disk was not deleted" },
      @{ Name = "installer ISO copy left behind"; Scenario = @{ IsoLeft = $true }; Reason = "the installer ISO copy was not deleted" },
      @{ Name = "no one-time password shown"; Scenario = @{ NoPassword = $true }; Reason = "the host kit showed no one-time password" },
      @{ Name = "a check on the VM failed"; Scenario = @{ VmStepFails = $true }; Reason = "a step on the VM failed" })) {
    $r = Invoke-Gate $case.Scenario
    if ($r.Verdict -eq "FAILED" -and $r.Code -eq 1 -and (Removed $r) -and "$($r.Reason)".Contains($case.Reason)) { Pass "fails on: $($case.Name), says so, and removes its VM" }
    else { Fail "$($case.Name): verdict $($r.Verdict), exit $($r.Code), removed $(Removed $r), reason '$($r.Reason)'" }
  }

  # 4. -Keep keeps the VM, even after a failure.
  $r = Invoke-Gate @{ DvdLeft = $true } @{ Keep = $true }
  if ($r.Verdict -eq "FAILED" -and -not (Removed $r)) { Pass "-Keep keeps a failed VM for inspection" } else { Fail "-Keep: removed $(Removed $r)" }

  # 5. Release media without a release lock is refused before any VM exists.
  $r = Invoke-Gate @{} @{ ReleaseMedia = $media }
  if ($r.Threw -and -not ($r.Calls | Where-Object { $_ -like "kit*" })) { Pass "media without a release lock is refused before building a VM" } else { Fail "unsigned media: kit called or not refused" }

  # 6. With media, the installer step runs, and its failure fails the gate.
  Set-Content (Join-Path $media "lospor-hospital-1.4.13-release.lock") "lock"
  $r = Invoke-Gate @{} @{ ReleaseMedia = $media }
  if ($r.Verdict -eq "PASSED" -and ($r.Calls | Where-Object { $_ -like "scp -i* -r *media*" })) { Pass "release media are copied and installed" } else { Fail "with media: verdict $($r.Verdict)" }
  $r = Invoke-Gate @{ VmStepFails = $true } @{ ReleaseMedia = $media }
  if ($r.Verdict -eq "FAILED" -and $r.Code -eq 1) { Pass "a failed install fails the gate" } else { Fail "failed install: verdict $($r.Verdict)" }
} finally {
  foreach ($name in "powershell.exe", "ssh", "scp", "Start-Sleep", "Get-NetNeighbor", "Get-VM", "Get-VMDvdDrive", "Get-VMHardDiskDrive", "Stop-VM", "Remove-VM") {
    Remove-Item "function:global:$name" -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failures -gt 0) { Write-Host "$failures gate check(s) failed" -ForegroundColor Red; exit 1 }
Write-Host "hyperv-install-gate: ok"
