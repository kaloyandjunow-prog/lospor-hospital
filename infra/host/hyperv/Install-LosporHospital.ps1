<#
.SYNOPSIS
  Install LOSPOR Hospital on this Hyper-V host: one set of questions, then
  nothing to type.

.DESCRIPTION
  Asks everything once, in a window (or, on Windows Server Core, as questions
  in this console), checks every answer before anything is created, and then
  runs New-LosporHospitalVm.ps1: Ubuntu installs by itself, and at its first
  boot the server installs LOSPOR Hospital by itself from these answers and
  reports its progress here. It ends with the Go-live address, or with the
  reason it stopped and how to continue.

  The release comes from next to this kit when the complete release files are
  there (offline), and otherwise from the internet (online). The version is
  the kit's own.

  Started by "Install LOSPOR Hospital.cmd". These scripts are not code-signed;
  the launcher runs them with -ExecutionPolicy Bypass for this process only.

.PARAMETER Text
  Ask the questions in this console instead of a window.

.PARAMETER AnswersFile
  A JSON file with every answer, for an unattended run (tests and automation).
  It holds passwords: delete it afterwards.
#>
[CmdletBinding()]
param(
  [switch] $Text,
  [string] $AnswersFile
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "LosporHostKit.ps1")

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
  if ($Text) { $arguments += "-Text" }
  if ($AnswersFile) { $arguments += @("-AnswersFile", "`"$AnswersFile`"") }
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments
  exit 0
}

$script:Locale = "bg"
function T([string] $En, [string] $Bg) { if ($script:Locale -eq "en") { return $En } return $Bg }

# ── what this host and this kit have ────────────────────────────────────────

if (-not (Get-Module -ListAvailable -Name Hyper-V)) {
  Write-Error "Hyper-V and its PowerShell module are not installed on this machine. / Hyper-V и модулът му за PowerShell не са инсталирани на тази машина."
  exit 1
}
Import-Module Hyper-V

# infra\host\hyperv is three levels below the release (or kit) folder.
$kitRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$kitScript = Join-Path $PSScriptRoot "New-LosporHospitalVm.ps1"

# Checks every folder that might hold an offline release next to the kit (the
# kit's own folder, then its parent -- an extracted zip commonly lands one
# level below the release files). A folder holding exactly one release lock is
# a real, deliberate answer -- "install from here" -- so an incomplete one
# stops the wizard with exactly what is missing, rather than being silently
# skipped as if no offline release were present.
#
# Skipping it here used to let two failures reach the operator only inside the
# VM, 10-20 minutes after Ubuntu had already installed: a lock present with a
# missing signature, deployment archive, security evidence or manifest still
# counted as "offline: complete" because only image parts were checked here,
# and a release missing even one image part silently fell back to downloading
# online instead of stopping -- exactly wrong for a hospital with no internet.
function Find-LosporRelease {
  foreach ($folder in @($kitRoot, (Split-Path $kitRoot -Parent))) {
    if (-not $folder) { continue }
    $found = Test-LosporOfflineRelease $folder
    if ($found) { return [pscustomobject] @{ Folder = $folder; Version = $found.Version; Problems = $found.Problems } }
  }
  return $null
}
$release = Find-LosporRelease
if ($release -and $release.Problems.Count -gt 0) {
  Write-Error (@(
    "The release folder next to this kit ($($release.Folder)) has a release lock for version $($release.Version), but it is not complete:",
    ($release.Problems | ForEach-Object { "  - $_" }),
    "Copy the missing files from the maintainer's USB, or remove $($release.Version)'s release.lock to install online instead.",
    "",
    "Папката с изданието до този комплект ($($release.Folder)) съдържа release lock за версия $($release.Version), но не е пълна:",
    ($release.Problems | ForEach-Object { "  - $_" }),
    "Копирайте липсващите файлове от USB паметта на поддържащия, или премахнете release.lock на версия $($release.Version), за да инсталирате онлайн."
  ) -join "`n")
  exit 1
}
$kitVersion = ""
if ($release) {
  $kitVersion = $release.Version
} elseif (Test-Path -LiteralPath (Join-Path $kitRoot "RELEASE-VERSION")) {
  $kitVersion = (Get-Content -Raw -LiteralPath (Join-Path $kitRoot "RELEASE-VERSION")).Trim()
} elseif (Test-Path -LiteralPath (Join-Path $kitRoot "package.json")) {
  try { $kitVersion = [string] (Get-Content -Raw -LiteralPath (Join-Path $kitRoot "package.json") | ConvertFrom-Json).version } catch { $kitVersion = "" }
}

$switches = @(Get-VMSwitch | Sort-Object @{ Expression = { if ($_.SwitchType -eq "External") { 0 } else { 1 } } }, Name)
$computer = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$hostMemoryGB = [int] [Math]::Floor($computer.TotalPhysicalMemory / 1GB)
$hostFreeMemoryGB = [int] [Math]::Floor($os.FreePhysicalMemory * 1KB / 1GB)
$hostCores = [int] $computer.NumberOfLogicalProcessors
$vmRoot = (Get-VMHost).VirtualMachinePath
$isos = @(foreach ($folder in @($kitRoot, (Split-Path $kitRoot -Parent), (Join-Path $env:USERPROFILE "Downloads"))) {
  if ($folder -and (Test-Path -LiteralPath $folder)) { Get-ChildItem -LiteralPath $folder -Filter "ubuntu-24.04*-live-server-amd64.iso" -File -ErrorAction SilentlyContinue }
})

function Get-FreeGB([string] $Path) {
  $qualifier = Split-Path -Qualifier $Path -ErrorAction SilentlyContinue
  if (-not $qualifier) { return $null }
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$qualifier'" -ErrorAction SilentlyContinue
  if (-not $disk) { return $null }
  return [int] [Math]::Floor($disk.FreeSpace / 1GB)
}

# ── the answers, with defaults ──────────────────────────────────────────────

$a = @{
  Locale = "bg"; Name = "LOSPOR Hospital"
  Switch = if ($switches.Count -gt 0) { $switches[0].Name } else { "" }
  Cores = [Math]::Min(8, [Math]::Max(1, $hostCores)); MemoryGB = 24; DiskGB = 400
  VmDirectory = Join-Path $vmRoot "LOSPOR Hospital"
  Encrypt = $false; DiskPassphrase = ""; DiskPassphraseRepeat = ""
  ConsolePassword = ""; ConsolePasswordRepeat = ""; SshKey = ""
  ClinicalDomain = ""; ResearchDomain = ""; HospitalName = ""; HospitalCity = ""
  TlsMode = "operator"; CertificateFormat = "pfx"; PfxPath = ""; PfxPassword = ""
  FullchainPath = ""; KeyPath = ""; CaPath = ""; AcmeEmail = ""
  AdminEmail = ""; AdminUsername = ""; AdminFirstName = ""; AdminLastName = ""; AdminPassword = ""; AdminPasswordRepeat = ""
  IsoPath = if ($isos.Count -gt 0) { $isos[0].FullName } else { "" }
  ReleaseVersion = $kitVersion
}
if ($AnswersFile) {
  $loaded = Get-Content -Raw -Encoding UTF8 -LiteralPath $AnswersFile | ConvertFrom-Json
  foreach ($property in $loaded.PSObject.Properties) { $a[$property.Name] = $property.Value }
  foreach ($pair in @(@("DiskPassphraseRepeat", "DiskPassphrase"), @("ConsolePasswordRepeat", "ConsolePassword"), @("AdminPasswordRepeat", "AdminPassword"))) {
    if (-not $a[$pair[0]]) { $a[$pair[0]] = $a[$pair[1]] }
  }
  $script:Locale = $a.Locale
}

# ── checks, page by page: errors stop, warnings are confirmed ───────────────

function New-Check { return [pscustomobject] @{ Errors = New-Object System.Collections.Generic.List[string]; Warnings = New-Object System.Collections.Generic.List[string] } }
function Add-AnswerProblems($Check, [string[]] $Fields) {
  foreach ($problem in (Test-LosporInstallAnswers (Get-KitAnswers))) {
    if ($Fields -contains $problem.Field) { $Check.Errors.Add((T $problem.En $problem.Bg)) }
  }
}
function Get-KitAnswers {
  return @{
    Locale = $a.Locale; ReleaseVersion = $a.ReleaseVersion; ClinicalDomain = $a.ClinicalDomain; ResearchDomain = $a.ResearchDomain
    TlsMode = $a.TlsMode; AcmeEmail = $a.AcmeEmail; HospitalName = $a.HospitalName; HospitalCity = $a.HospitalCity
    AdminEmail = $a.AdminEmail; AdminUsername = $a.AdminUsername; AdminFirstName = $a.AdminFirstName; AdminLastName = $a.AdminLastName
  }
}

function Test-ServerPage {
  $check = New-Check
  # A test of the kit itself on a small host: the LOSPOR installer refuses such a VM anyway.
  $small = $env:LOSPOR_WIZARD_ALLOW_SMALL_VM -eq "1"
  if (-not $a.Name -or $a.Name -match '[\\/:*?"<>|'']') { $check.Errors.Add((T "Give the virtual machine a name without \ / : * ? `" < > | or quotes." "Дайте име на виртуалната машина без \ / : * ? `" < > | или кавички.")) }
  elseif (Get-VM -Name $a.Name -ErrorAction SilentlyContinue) { $check.Errors.Add((T "A virtual machine named '$($a.Name)' already exists." "Вече има виртуална машина с име '$($a.Name)'.")) }
  $switch = $switches | Where-Object { $_.Name -eq $a.Switch } | Select-Object -First 1
  if (-not $switch) {
    $check.Errors.Add((T "Choose the virtual switch that connects the VM to the hospital network. If there is none, create an External switch in Hyper-V Manager first." "Изберете виртуалния комутатор, който свързва машината с болничната мрежа. Ако няма такъв, първо създайте външен (External) комутатор в Hyper-V Manager."))
  } elseif ($switch.SwitchType -ne "External") {
    $check.Warnings.Add((T "'$($switch.Name)' is not an External switch: computers on the wards may not be able to reach the server through it." "'$($switch.Name)' не е външен (External) комутатор: компютрите в отделенията може да не достигат сървъра през него."))
  }
  if ($a.Cores -lt 8 -and -not $small) { $check.Errors.Add((T "LOSPOR needs at least 8 processor cores." "LOSPOR изисква поне 8 процесорни ядра.")) }
  if ($a.Cores -gt $hostCores) { $check.Errors.Add((T "This machine has $hostCores logical processors." "Тази машина има $hostCores логически процесора.")) }
  if ($a.MemoryGB -lt 16 -and -not $small) { $check.Errors.Add((T "LOSPOR needs at least 16 GB of memory." "LOSPOR изисква поне 16 GB памет.")) }
  if ($a.MemoryGB -gt $hostMemoryGB) { $check.Errors.Add((T "This machine has $hostMemoryGB GB of memory." "Тази машина има $hostMemoryGB GB памет.")) }
  elseif ($a.MemoryGB -gt $hostFreeMemoryGB) { $check.Warnings.Add((T "Only $hostFreeMemoryGB GB of memory is free now; the VM may not start." "В момента са свободни само $hostFreeMemoryGB GB памет; машината може да не стартира.")) }
  if ($a.DiskGB -lt 256 -and -not $small) { $check.Errors.Add((T "LOSPOR needs a disk of at least 256 GB." "LOSPOR изисква диск от поне 256 GB.")) }
  if (-not $a.VmDirectory -or -not [IO.Path]::IsPathRooted($a.VmDirectory)) { $check.Errors.Add((T "Choose a full folder path for the VM." "Изберете пълен път до папка за машината.")) }
  else {
    $free = Get-FreeGB $a.VmDirectory
    if ($null -eq $free) { $check.Errors.Add((T "The drive of $($a.VmDirectory) was not found." "Дискът на $($a.VmDirectory) не е намерен.")) }
    elseif ($free -lt 80) { $check.Errors.Add((T "The drive has only $free GB free; the installation alone needs about 80 GB." "Дискът има само $free GB свободни; самата инсталация изисква около 80 GB.")) }
    elseif ($free -lt $a.DiskGB) { $check.Warnings.Add((T "The drive has $free GB free. The VM's disk grows as it is used, up to $($a.DiskGB) GB, and stops the VM if the drive fills." "Дискът има $free GB свободни. Дискът на машината расте с използването до $($a.DiskGB) GB и спира машината, ако дискът се запълни.")) }
  }
  if ($a.Encrypt) {
    if ($a.DiskPassphrase.Length -lt 16 -or $a.DiskPassphrase.Contains('"') -or $a.DiskPassphrase.Contains('\')) { $check.Errors.Add((T "The disk passphrase needs at least 16 characters, without quotes or backslashes." "Паролата за диска трябва да е поне 16 знака, без кавички и обратни наклонени черти.")) }
    elseif ($a.DiskPassphrase -ne $a.DiskPassphraseRepeat) { $check.Errors.Add((T "The two disk passphrases differ." "Двете пароли за диска се различават.")) }
    $check.Warnings.Add((T "With disk encryption, the server waits after every restart, including after a power cut, until someone types the passphrase in the Hyper-V console." "При шифроване на диска сървърът чака след всяко рестартиране, включително след спиране на тока, докато някой въведе паролата в конзолата на Hyper-V."))
  }
  return $check
}

function Test-LoginPage {
  $check = New-Check
  if ($a.ConsolePassword.Length -lt 10 -or $a.ConsolePassword -match '[\r\n]') { $check.Errors.Add((T "The server password needs at least 10 characters." "Паролата за сървъра трябва да е поне 10 знака.")) }
  elseif ($a.ConsolePassword -ne $a.ConsolePasswordRepeat) { $check.Errors.Add((T "The two server passwords differ." "Двете пароли за сървъра се различават.")) }
  $key = ([string] $a.SshKey).Trim()
  if ($key -and $key -notmatch '^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( [^"\r\n]*)?$') { $check.Errors.Add((T "The SSH key must be one OpenSSH public key (a .pub file), for example ssh-ed25519 AAAA..." "SSH ключът трябва да е един публичен ключ на OpenSSH (файл .pub), например ssh-ed25519 AAAA...")) }
  return $check
}

function Test-HospitalPage {
  $check = New-Check
  Add-AnswerProblems $check @("ClinicalDomain", "ResearchDomain", "HospitalName", "HospitalCity")
  if ($check.Errors.Count -eq 0) {
    foreach ($name in @($a.ClinicalDomain, $a.ResearchDomain)) {
      if (-not (Resolve-DnsName -Name $name -ErrorAction SilentlyContinue)) {
        $check.Warnings.Add((T "$name is not in DNS yet. That is fine: the installation waits, shows the server's address, and continues once IT adds the name." "$name още не е в DNS. Това е наред: инсталацията изчаква, показва адреса на сървъра и продължава, когато ИТ добави името."))
      }
    }
  }
  return $check
}

function Test-CertificatePage {
  $check = New-Check
  Add-AnswerProblems $check @("TlsMode", "AcmeEmail")
  if ($a.TlsMode -eq "operator") {
    $names = @($a.ClinicalDomain, $a.ResearchDomain)
    if ($a.CertificateFormat -eq "pfx") {
      if (-not (Test-Path -LiteralPath $a.PfxPath -PathType Leaf)) { $check.Errors.Add((T "Choose the .pfx file from the hospital's certificate office." "Изберете файла .pfx от удостоверителния център на болницата.")) }
      else {
        $summary = Get-LosporPfxSummary $a.PfxPath $a.PfxPassword $names
        if (-not $summary.Opened) { $check.Errors.Add((T "The .pfx file could not be opened with this password." "Файлът .pfx не можа да бъде отворен с тази парола.")) }
        elseif (-not $summary.HasKey) { $check.Errors.Add((T "The .pfx file holds no certificate with its private key." "Файлът .pfx не съдържа сертификат с частен ключ.")) }
        else {
          if ($summary.MissingNames.Count -gt 0) { $check.Errors.Add((T "The certificate does not cover: $($summary.MissingNames -join ', '). It must cover both addresses." "Сертификатът не покрива: $($summary.MissingNames -join ', '). Трябва да покрива и двата адреса.")) }
          if ($summary.NotAfter -lt (Get-Date).AddDays(30)) { $check.Errors.Add((T "The certificate expires on $($summary.NotAfter.ToString('yyyy-MM-dd')); it needs at least 30 more days." "Сертификатът изтича на $($summary.NotAfter.ToString('yyyy-MM-dd')); трябва да е валиден още поне 30 дни.")) }
          if (-not $summary.HasRoot -and -not (Test-Path -LiteralPath $a.CaPath -PathType Leaf)) { $check.Errors.Add((T "The .pfx does not include the hospital's root authority certificate. Choose its CA file as well." "Файлът .pfx не съдържа коренния сертификат на удостоверителния център на болницата. Изберете и файла на CA.")) }
        }
      }
    } else {
      foreach ($file in @(@($a.FullchainPath, "certificate", "сертификата"), @($a.KeyPath, "private key", "частния ключ"), @($a.CaPath, "authority (CA) certificate", "сертификата на удостоверителния център (CA)"))) {
        if (-not (Test-Path -LiteralPath $file[0] -PathType Leaf)) { $check.Errors.Add((T "Choose the $($file[1]) file." "Изберете файла на $($file[2]).")) }
        elseif ((Get-Content -Raw -LiteralPath $file[0]) -notmatch '-----BEGIN ') { $check.Errors.Add((T "$($file[0]) is not a PEM file. Give a .pfx instead, or convert it." "$($file[0]) не е PEM файл. Дайте .pfx или го преобразувайте.")) }
      }
    }
    if ($a.CaPath -and (Test-Path -LiteralPath $a.CaPath -PathType Leaf)) {
      $caText = Get-Content -Raw -LiteralPath $a.CaPath -ErrorAction SilentlyContinue
      if ($caText -notmatch '-----BEGIN CERTIFICATE-----') {
        try { [void] (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $a.CaPath) } catch { $check.Errors.Add((T "The CA file is not a certificate." "Файлът на CA не е сертификат.")) }
      }
    }
  } elseif ($a.TlsMode -eq "acme") {
    $check.Warnings.Add((T "Let's Encrypt works only if the server is reachable from the internet on port 80 under both addresses, and again every two months to renew." "Let's Encrypt работи само ако сървърът е достъпен от интернет на порт 80 с двата адреса, и отново на всеки два месеца за подновяване."))
  } else {
    $check.Warnings.Add((T "A local certificate is trusted by no computer or phone until IT installs the appliance's own authority on each one. Use it for testing." "Локалният сертификат не е доверен от нито един компютър или телефон, докато ИТ не инсталира собствения удостоверител на системата на всеки от тях. Използвайте го за тестове."))
  }
  return $check
}

function Test-AdministratorPage {
  $check = New-Check
  Add-AnswerProblems $check @("AdminEmail", "AdminUsername", "AdminFirstName", "AdminLastName", "Locale", "ReleaseVersion")
  $missing = Test-LosporAdminPassword $a.AdminPassword
  if ($missing.Count -gt 0) { $check.Errors.Add((T "The administrator password needs: $(($missing | ForEach-Object { $_.En }) -join ', ')." "Паролата на администратора изисква: $(($missing | ForEach-Object { $_.Bg }) -join ', ').")) }
  elseif ($a.AdminPassword -ne $a.AdminPasswordRepeat) { $check.Errors.Add((T "The two administrator passwords differ." "Двете пароли на администратора се различават.")) }
  elseif ($a.AdminPassword -eq $a.ConsolePassword) { $check.Errors.Add((T "The administrator password must differ from the server password." "Паролата на администратора трябва да е различна от паролата за сървъра.")) }
  return $check
}

function Test-SummaryPage {
  $check = New-Check
  if ($a.IsoPath -and -not (Test-Path -LiteralPath $a.IsoPath -PathType Leaf)) { $check.Errors.Add((T "The Ubuntu ISO was not found at $($a.IsoPath)." "Ubuntu ISO не е намерен в $($a.IsoPath).")) }
  if (-not $release -and -not $a.ReleaseVersion) { $check.Warnings.Add((T "The kit does not know its release version, so the newest release is installed." "Комплектът не знае версията си, затова се инсталира най-новата версия.")) }
  return $check
}

function Get-SummaryLines {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add((T "Virtual machine: $($a.Name), $($a.Cores) cores, $($a.MemoryGB) GB memory, $($a.DiskGB) GB disk, on '$($a.Switch)'" "Виртуална машина: $($a.Name), $($a.Cores) ядра, $($a.MemoryGB) GB памет, $($a.DiskGB) GB диск, на '$($a.Switch)'"))
  $lines.Add((T "Folder: $($a.VmDirectory)" "Папка: $($a.VmDirectory)"))
  if ($a.Encrypt) { $lines.Add((T "Disk encryption: on" "Шифроване на диска: включено")) }
  $lines.Add((T "Server login: lospor$(if (([string] $a.SshKey).Trim()) { ', with an SSH key' })" "Вход в сървъра: lospor$(if (([string] $a.SshKey).Trim()) { ', с SSH ключ' })"))
  $lines.Add((T "Addresses: $($a.ClinicalDomain) (clinical), $($a.ResearchDomain) (research)" "Адреси: $($a.ClinicalDomain) (клиничен), $($a.ResearchDomain) (изследвания)"))
  $lines.Add((T "Hospital: $($a.HospitalName), $($a.HospitalCity)" "Болница: $($a.HospitalName), $($a.HospitalCity)"))
  $certificate = switch ($a.TlsMode) { "operator" { T "the hospital's own authority" "собственият удостоверителен център на болницата" } "acme" { "Let's Encrypt" } default { T "local (testing)" "локален (за тестове)" } }
  $lines.Add((T "Certificate: $certificate" "Сертификат: $certificate"))
  $lines.Add((T "Administrator: $($a.AdminFirstName) $($a.AdminLastName), $($a.AdminEmail), username $($a.AdminUsername)" "Администратор: $($a.AdminFirstName) $($a.AdminLastName), $($a.AdminEmail), потребител $($a.AdminUsername)"))
  if ($release) { $lines.Add((T "Release: $($release.Version), offline from $($release.Folder)" "Издание: $($release.Version), без мрежа от $($release.Folder)")) }
  else { $lines.Add((T "Release: $(if ($a.ReleaseVersion) { $a.ReleaseVersion } else { 'newest' }), downloaded by the server (it needs internet access)" "Издание: $(if ($a.ReleaseVersion) { $a.ReleaseVersion } else { 'най-новото' }), изтегля се от сървъра (нужен е достъп до интернет)")) }
  if ($a.IsoPath) { $lines.Add((T "Ubuntu: $($a.IsoPath)" "Ubuntu: $($a.IsoPath)")) }
  else { $lines.Add((T "Ubuntu: downloaded from ubuntu.com (about 3 GB) and checked" "Ubuntu: изтегля се от ubuntu.com (около 3 GB) и се проверява")) }
  return $lines
}

$pages = @(
  @{ Id = "language"; Test = $null },
  @{ Id = "server"; Test = ${function:Test-ServerPage} },
  @{ Id = "login"; Test = ${function:Test-LoginPage} },
  @{ Id = "hospital"; Test = ${function:Test-HospitalPage} },
  @{ Id = "certificate"; Test = ${function:Test-CertificatePage} },
  @{ Id = "administrator"; Test = ${function:Test-AdministratorPage} },
  @{ Id = "summary"; Test = ${function:Test-SummaryPage} }
)

# ── text mode (Windows Server Core) ─────────────────────────────────────────

function Read-Answer([string] $Prompt, [string] $Current) {
  $shown = if ($Current) { " [$Current]" } else { "" }
  $answer = Read-Host "$Prompt$shown"
  if ($answer) { return $answer.Trim() }
  return $Current
}
function Read-Number([string] $Prompt, [int] $Current) {
  while ($true) {
    $answer = Read-Answer $Prompt ([string] $Current)
    $number = 0
    if ([int]::TryParse($answer, [ref] $number)) { return $number }
    Write-Host (T "  ! Give a whole number." "  ! Въведете цяло число.") -ForegroundColor Red
  }
}
function Read-Secret([string] $Prompt) {
  $secure = Read-Host -AsSecureString $Prompt
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
function Read-TextPage([string] $Id) {
  switch ($Id) {
    "language" {
      $choice = Read-Host "Език / Language: 1) Български  2) English [1]"
      $script:Locale = if ($choice -eq "2") { "en" } else { "bg" }
      $a.Locale = $script:Locale
    }
    "server" {
      Write-Host (T "Virtual switches:" "Виртуални комутатори:")
      foreach ($switch in $switches) { Write-Host "  $($switch.Name) ($($switch.SwitchType))" }
      $a.Name = Read-Answer (T "Virtual machine name" "Име на виртуалната машина") $a.Name
      $a.Switch = Read-Answer (T "Virtual switch" "Виртуален комутатор") $a.Switch
      Write-Host (T "This machine: $hostCores logical processors, $hostMemoryGB GB memory ($hostFreeMemoryGB GB free)." "Тази машина: $hostCores логически процесора, $hostMemoryGB GB памет ($hostFreeMemoryGB GB свободни).")
      $a.Cores = Read-Number (T "Processor cores (at least 8)" "Процесорни ядра (поне 8)") $a.Cores
      $a.MemoryGB = Read-Number (T "Memory in GB (at least 16)" "Памет в GB (поне 16)") $a.MemoryGB
      $a.DiskGB = Read-Number (T "Disk in GB (at least 256; grows as used)" "Диск в GB (поне 256; расте с използването)") $a.DiskGB
      $a.VmDirectory = Read-Answer (T "Folder for the VM" "Папка за машината") $a.VmDirectory
      $a.Encrypt = (Read-Answer (T "Encrypt the disk? It then asks for a passphrase at every restart (y/N)" "Шифроване на диска? Тогава иска парола при всяко рестартиране (y/N)") "N") -match '^[yYдД]'
      if ($a.Encrypt) {
        $a.DiskPassphrase = Read-Secret (T "Disk passphrase (at least 16 characters)" "Парола за диска (поне 16 знака)")
        $a.DiskPassphraseRepeat = Read-Secret (T "Repeat the disk passphrase" "Повторете паролата за диска")
      }
    }
    "login" {
      Write-Host (T "The server's console user is lospor." "Потребителят за конзолата на сървъра е lospor.")
      $a.ConsolePassword = Read-Secret (T "Server password (at least 10 characters)" "Парола за сървъра (поне 10 знака)")
      $a.ConsolePasswordRepeat = Read-Secret (T "Repeat the server password" "Повторете паролата за сървъра")
      $path = Read-Answer (T "SSH public key file (.pub), optional" "Файл с публичен SSH ключ (.pub), по избор") ""
      $a.SshKey = if ($path -and (Test-Path -LiteralPath $path)) { (Get-Content -Raw -LiteralPath $path).Trim() } else { $path }
    }
    "hospital" {
      $a.ClinicalDomain = Read-Answer (T "Clinical address (web, phone app)" "Клиничен адрес (уеб, мобилно приложение)") $a.ClinicalDomain
      $a.ResearchDomain = Read-Answer (T "Research website address" "Адрес на сайта за изследвания") $a.ResearchDomain
      $a.HospitalName = Read-Answer (T "Hospital name" "Име на болницата") $a.HospitalName
      $a.HospitalCity = Read-Answer (T "City" "Град") $a.HospitalCity
    }
    "certificate" {
      $choice = Read-Answer (T "Certificate: 1) hospital's own authority  2) Let's Encrypt  3) local, for testing" "Сертификат: 1) собствен удостоверителен център на болницата  2) Let's Encrypt  3) локален, за тестове") "1"
      $a.TlsMode = switch ($choice) { "2" { "acme" } "3" { "local" } default { "operator" } }
      if ($a.TlsMode -eq "operator") {
        $a.CertificateFormat = if ((Read-Answer (T "Files: 1) one .pfx  2) PEM certificate, key and CA" "Файлове: 1) един .pfx  2) PEM сертификат, ключ и CA") "1") -eq "2") { "pem" } else { "pfx" }
        if ($a.CertificateFormat -eq "pfx") {
          $a.PfxPath = Read-Answer (T ".pfx file" "Файл .pfx") $a.PfxPath
          $a.PfxPassword = Read-Secret (T ".pfx password" "Парола на .pfx")
          $a.CaPath = Read-Answer (T "CA certificate file (only if the .pfx does not include it)" "Файл на CA сертификата (само ако .pfx не го съдържа)") $a.CaPath
        } else {
          $a.FullchainPath = Read-Answer (T "Certificate file (PEM)" "Файл на сертификата (PEM)") $a.FullchainPath
          $a.KeyPath = Read-Answer (T "Private key file (PEM)" "Файл на частния ключ (PEM)") $a.KeyPath
          $a.CaPath = Read-Answer (T "CA certificate file (PEM)" "Файл на CA сертификата (PEM)") $a.CaPath
        }
      } elseif ($a.TlsMode -eq "acme") {
        $a.AcmeEmail = Read-Answer (T "Email for certificate notices" "Имейл за известия за сертификата") $a.AcmeEmail
      }
    }
    "administrator" {
      $a.AdminEmail = Read-Answer (T "Administrator email (signs in to Status)" "Имейл на администратора (вход в Status)") $a.AdminEmail
      $a.AdminUsername = Read-Answer (T "Administrator username (clinical apps)" "Потребителско име на администратора (клинични приложения)") $a.AdminUsername
      $a.AdminFirstName = Read-Answer (T "First name" "Собствено име") $a.AdminFirstName
      $a.AdminLastName = Read-Answer (T "Last name" "Фамилия") $a.AdminLastName
      $a.AdminPassword = Read-Secret (T "Administrator password (8+ characters, uppercase letter, number, symbol)" "Парола на администратора (8+ знака, главна буква, цифра, символ)")
      $a.AdminPasswordRepeat = Read-Secret (T "Repeat the administrator password" "Повторете паролата на администратора")
    }
    "summary" {
      Write-Host ""
      Get-SummaryLines | ForEach-Object { Write-Host "  $_" }
      $a.IsoPath = Read-Answer (T "Ubuntu 24.04 server ISO (empty: download it)" "Ubuntu 24.04 server ISO (празно: изтегля се)") $a.IsoPath
    }
  }
}

function Invoke-TextWizard {
  foreach ($page in $pages) {
    while ($true) {
      Read-TextPage $page.Id
      if (-not $page.Test) { break }
      $check = & $page.Test
      foreach ($errorText in $check.Errors) { Write-Host "  ! $errorText" -ForegroundColor Red }
      if ($check.Errors.Count -gt 0) { continue }
      foreach ($warning in $check.Warnings) { Write-Host "  * $warning" -ForegroundColor Yellow }
      if ($page.Id -eq "summary") {
        if ((Read-Host (T "Install now? (y/N)" "Да се инсталира ли сега? (y/N)")) -notmatch '^[yYдД]') { return $false }
      } elseif ($check.Warnings.Count -gt 0) {
        if ((Read-Host (T "Continue? (Y/n)" "Продължаване? (Y/n)")) -match '^[nNнН]') { continue }
      }
      break
    }
  }
  return $true
}

# ── the window ──────────────────────────────────────────────────────────────

function Invoke-WindowWizard {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()

  $form = New-Object System.Windows.Forms.Form
  $form.Size = New-Object System.Drawing.Size(820, 660)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

  $heading = New-Object System.Windows.Forms.Label
  $heading.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
  $heading.Dock = "Top"; $heading.Height = 48; $heading.Padding = New-Object System.Windows.Forms.Padding(16, 12, 16, 0)
  $content = New-Object System.Windows.Forms.Panel
  $content.Dock = "Fill"; $content.AutoScroll = $true; $content.Padding = New-Object System.Windows.Forms.Padding(16, 8, 16, 8)
  $bottom = New-Object System.Windows.Forms.Panel
  $bottom.Dock = "Bottom"; $bottom.Height = 56
  $problems = New-Object System.Windows.Forms.Label
  $problems.Dock = "Bottom"; $problems.Height = 70; $problems.ForeColor = [System.Drawing.Color]::Firebrick; $problems.Padding = New-Object System.Windows.Forms.Padding(16, 4, 16, 0)
  $back = New-Object System.Windows.Forms.Button; $back.Size = New-Object System.Drawing.Size(110, 34); $back.Location = New-Object System.Drawing.Point(440, 10)
  $next = New-Object System.Windows.Forms.Button; $next.Size = New-Object System.Drawing.Size(130, 34); $next.Location = New-Object System.Drawing.Point(556, 10)
  $cancel = New-Object System.Windows.Forms.Button; $cancel.Size = New-Object System.Drawing.Size(100, 34); $cancel.Location = New-Object System.Drawing.Point(692, 10)
  $bottom.Controls.AddRange(@($back, $next, $cancel))
  $form.Controls.Add($content); $form.Controls.Add($problems); $form.Controls.Add($bottom); $form.Controls.Add($heading)

  $script:ui = @{}
  $script:pageIndex = 0

  $script:table = $null
  $newTable = {
    $t = New-Object System.Windows.Forms.TableLayoutPanel
    $t.ColumnCount = 3; $t.Dock = "Top"; $t.AutoSize = $true
    [void] $t.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 230)))
    [void] $t.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 400)))
    [void] $t.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 110)))
    $content.Controls.Add($t)
    return $t
  }
  # Every row is remembered by a name, so rows that do not apply to the current
  # choice (a disk passphrase without encryption, PEM files for a .pfx) are hidden.
  function Add-Note([string] $TextValue, [string] $Row = "") {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $TextValue; $label.AutoSize = $false; $label.Width = 740
    $size = [System.Windows.Forms.TextRenderer]::MeasureText($TextValue, $form.Font, (New-Object System.Drawing.Size(730, 0)), [System.Windows.Forms.TextFormatFlags]::WordBreak)
    $label.Height = $size.Height + 10
    $script:table.Controls.Add($label, 0, $script:table.RowCount); $script:table.SetColumnSpan($label, 3); $script:table.RowCount++
    if ($Row) { $script:rows[$Row] = @($label) }
  }
  function Add-Field([string] $Key, [string] $LabelText, $Control, $Extra, [switch] $Wide, [string] $Row = "") {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $LabelText; $label.AutoSize = $false; $label.Width = 225; $label.Height = 42; $label.TextAlign = "MiddleLeft"
    $Control.Width = if ($Wide) { 505 } else { 390 }
    $script:table.Controls.Add($label, 0, $script:table.RowCount); $script:table.Controls.Add($Control, 1, $script:table.RowCount)
    if ($Wide) { $script:table.SetColumnSpan($Control, 2) }
    if ($Extra) { $script:table.Controls.Add($Extra, 2, $script:table.RowCount) }
    $script:table.RowCount++
    if ($Key) { $script:ui[$Key] = $Control }
    $name = if ($Row) { $Row } else { $Key }
    if ($name) { $script:rows[$name] = @($label, $Control, $Extra) | Where-Object { $_ } }
  }
  function Set-RowsVisible([string[]] $Names, [bool] $Visible) {
    foreach ($name in $Names) { if ($script:rows.ContainsKey($name)) { foreach ($control in $script:rows[$name]) { $control.Visible = $Visible } } }
  }
  function Update-Rows {
    if ($script:ui.ContainsKey("Encrypt")) { Set-RowsVisible @("DiskPassphrase", "DiskPassphraseRepeat") $script:ui["Encrypt"].Checked }
    if ($script:ui.ContainsKey("TlsOperator")) {
      $operator = $script:ui["TlsOperator"].Checked
      $pfx = $script:ui["FormatPfx"].Checked
      Set-RowsVisible @("Format", "CaPath", "CaNote") $operator
      Set-RowsVisible @("PfxPath", "PfxPassword") ($operator -and $pfx)
      Set-RowsVisible @("FullchainPath", "KeyPath") ($operator -and -not $pfx)
      Set-RowsVisible @("AcmeEmail") $script:ui["TlsAcme"].Checked
      Set-RowsVisible @("LocalNote") (-not $operator -and -not $script:ui["TlsAcme"].Checked)
    }
  }
  function New-TextBox([string] $Value, [switch] $Secret) {
    $box = New-Object System.Windows.Forms.TextBox
    $box.Text = $Value
    if ($Secret) { $box.UseSystemPasswordChar = $true }
    return $box
  }
  function New-Number([int] $Value, [int] $Minimum, [int] $Maximum) {
    $number = New-Object System.Windows.Forms.NumericUpDown
    $number.Minimum = $Minimum; $number.Maximum = [Math]::Max($Maximum, $Minimum); $number.Value = [Math]::Min([Math]::Max($Value, $Minimum), [Math]::Max($Maximum, $Minimum))
    return $number
  }
  function New-Browse([string] $TargetKey, [string] $Filter, [switch] $Folder, [switch] $LoadText) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = T "Browse..." "Избор..."; $button.Width = 100; $button.Height = 32
    $button.Tag = @{ Key = $TargetKey; Filter = $Filter; Folder = [bool] $Folder; LoadText = [bool] $LoadText }
    $button.Add_Click({
      $tag = $this.Tag
      if ($tag.Folder) {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        if ($dialog.ShowDialog() -eq "OK") { $script:ui[$tag.Key].Text = Join-Path $dialog.SelectedPath "LOSPOR Hospital" }
      } else {
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = $tag.Filter
        if ($dialog.ShowDialog() -eq "OK") {
          $script:ui[$tag.Key].Text = if ($tag.LoadText) { (Get-Content -Raw -LiteralPath $dialog.FileName).Trim() } else { $dialog.FileName }
        }
      }
    })
    return $button
  }
  function New-Radio([string] $TextValue, [bool] $Checked) {
    $radio = New-Object System.Windows.Forms.RadioButton
    $radio.Text = $TextValue; $radio.Checked = $Checked; $radio.AutoSize = $true
    return $radio
  }

  function Show-Page {
    $content.Controls.Clear()
    $script:ui = @{}
    $script:rows = @{}
    $problems.Text = ""
    $id = $pages[$script:pageIndex].Id
    $form.Text = T "Install LOSPOR Hospital" "Инсталиране на LOSPOR Hospital"
    $back.Text = T "Back" "Назад"; $cancel.Text = T "Cancel" "Отказ"
    $next.Text = if ($id -eq "summary") { T "Install" "Инсталиране" } else { T "Next" "Напред" }
    $back.Enabled = $script:pageIndex -gt 0
    $script:table = & $newTable
    switch ($id) {
      "language" {
        $heading.Text = "Инсталиране на LOSPOR Hospital / Install LOSPOR Hospital"
        Add-Note "Изберете език. / Choose a language."
        $bg = New-Radio "Български" ($a.Locale -ne "en"); $en = New-Radio "English" ($a.Locale -eq "en")
        Add-Field "LocaleBg" "Език / Language" $bg $null
        Add-Field "LocaleEn" "" $en $null
        Add-Note ("Този помощник пита всичко веднъж и проверява отговорите, преди да създаде каквото и да е. След това Ubuntu и LOSPOR се инсталират сами (около час) и тук се показва адресът на страницата «Готовност».`n`n" +
          "This wizard asks everything once and checks the answers before creating anything. Then Ubuntu and LOSPOR install by themselves (about an hour), and this window shows the Go-live address.`n`n" +
          "Нужни са: клиничното и изследователското DNS име, сертификатът на болницата (файл .pfx), ако е от нейния удостоверителен център, и интернет, освен ако файловете на изданието са до този комплект.`n`n" +
          "You need: the clinical and research DNS names, the hospital certificate (a .pfx file) if it comes from the hospital's authority, and an internet connection unless the release files are next to this kit.")
      }
      "server" {
        $heading.Text = T "1. The virtual machine" "1. Виртуалната машина"
        Add-Note (T "This machine: $hostCores logical processors, $hostMemoryGB GB memory ($hostFreeMemoryGB GB free)." "Тази машина: $hostCores логически процесора, $hostMemoryGB GB памет ($hostFreeMemoryGB GB свободни).")
        Add-Field "Name" (T "Name" "Име") (New-TextBox $a.Name) $null
        $combo = New-Object System.Windows.Forms.ComboBox
        $combo.DropDownStyle = "DropDownList"
        foreach ($switch in $switches) { [void] $combo.Items.Add("$($switch.Name)  ($($switch.SwitchType))") }
        $selected = [Array]::IndexOf(@($switches | ForEach-Object { $_.Name }), $a.Switch)
        if ($selected -ge 0) { $combo.SelectedIndex = $selected }
        Add-Field "Switch" (T "Network (virtual switch)" "Мрежа (виртуален комутатор)") $combo $null
        Add-Note (T "The switch connects the VM to the hospital network. Choose an External one; 'Default Switch' reaches only this machine." "Комутаторът свързва машината с болничната мрежа. Изберете външен (External); 'Default Switch' достига само тази машина.")
        Add-Field "Cores" (T "Processor cores" "Процесорни ядра") (New-Number $a.Cores 8 64) $null
        Add-Field "MemoryGB" (T "Memory (GB)" "Памет (GB)") (New-Number $a.MemoryGB 16 256) $null
        Add-Field "DiskGB" (T "Disk (GB, grows as used)" "Диск (GB, расте с използването)") (New-Number $a.DiskGB 256 4096) $null
        Add-Field "VmDirectory" (T "Folder" "Папка") (New-TextBox $a.VmDirectory) (New-Browse "VmDirectory" "" -Folder)
        $encrypt = New-Object System.Windows.Forms.CheckBox
        $encrypt.Text = T "Encrypt the disk (asks for a passphrase at every restart)" "Шифроване на диска (иска парола при всяко рестартиране)"
        $encrypt.Checked = [bool] $a.Encrypt
        $encrypt.Add_CheckedChanged({ Update-Rows })
        Add-Field "Encrypt" (T "Encryption" "Шифроване") $encrypt $null -Wide
        Add-Field "DiskPassphrase" (T "Disk passphrase" "Парола за диска") (New-TextBox $a.DiskPassphrase -Secret) $null
        Add-Field "DiskPassphraseRepeat" (T "Repeat it" "Повторете я") (New-TextBox $a.DiskPassphraseRepeat -Secret) $null
        Add-Note (T "Most hospitals encrypt this Windows drive with BitLocker instead, which needs no passphrase after a power cut." "Повечето болници вместо това шифроват диска на Windows с BitLocker, който не иска парола след спиране на тока.")
      }
      "login" {
        $heading.Text = T "2. Signing in to the server" "2. Вход в сървъра"
        Add-Note (T "For Hospital IT's maintenance at the server console. The user is lospor. This is not the LOSPOR administrator." "За поддръжка от болничния ИТ екип в конзолата на сървъра. Потребителят е lospor. Това не е администраторът на LOSPOR.")
        Add-Field "ConsolePassword" (T "Server password" "Парола за сървъра") (New-TextBox $a.ConsolePassword -Secret) $null
        Add-Field "ConsolePasswordRepeat" (T "Repeat it" "Повторете я") (New-TextBox $a.ConsolePasswordRepeat -Secret) $null
        $keyBox = New-TextBox $a.SshKey
        $keyBox.Multiline = $true; $keyBox.Height = 70
        Add-Field "SshKey" (T "SSH public key (optional)" "Публичен SSH ключ (по избор)") $keyBox (New-Browse "SshKey" "OpenSSH public key (*.pub)|*.pub|All files (*.*)|*.*" -LoadText)
        Add-Note (T "Choose the .pub file, or paste the key. Over SSH only the key works, never the password." "Изберете файла .pub или поставете ключа. През SSH работи само ключът, никога паролата.")
      }
      "hospital" {
        $heading.Text = T "3. The hospital" "3. Болницата"
        Add-Field "ClinicalDomain" (T "Clinical address" "Клиничен адрес") (New-TextBox $a.ClinicalDomain) $null
        Add-Field "ResearchDomain" (T "Research website address" "Адрес за изследвания") (New-TextBox $a.ResearchDomain) $null
        Add-Note (T "Two DNS names in the hospital's DNS, both pointing to this server. If they are not there yet, the installation waits, shows the server's address, and continues once IT adds them." "Две имена в DNS на болницата, и двете сочещи към този сървър. Ако още ги няма, инсталацията изчаква, показва адреса на сървъра и продължава, когато ИТ ги добави.")
        Add-Field "HospitalName" (T "Hospital name" "Име на болницата") (New-TextBox $a.HospitalName) $null
        Add-Field "HospitalCity" (T "City" "Град") (New-TextBox $a.HospitalCity) $null
      }
      "certificate" {
        $heading.Text = T "4. The HTTPS certificate" "4. HTTPS сертификатът"
        $operator = New-Radio (T "From the hospital's own certificate authority (recommended)" "От собствения удостоверителен център на болницата (препоръчително)") ($a.TlsMode -eq "operator")
        $acme = New-Radio (T "Let's Encrypt (needs the server reachable from the internet)" "Let's Encrypt (сървърът трябва да е достъпен от интернет)") ($a.TlsMode -eq "acme")
        $local = New-Radio (T "Local, for testing (every device warns)" "Локален, за тестове (всяко устройство предупреждава)") ($a.TlsMode -eq "local")
        $group = New-Object System.Windows.Forms.FlowLayoutPanel
        $group.FlowDirection = "TopDown"; $group.Height = 90; $group.Controls.AddRange(@($operator, $acme, $local))
        Add-Field "" (T "Certificate" "Сертификат") $group $null -Wide -Row "Mode"
        $script:ui["TlsOperator"] = $operator; $script:ui["TlsAcme"] = $acme
        $pfx = New-Radio (T "One .pfx file" "Един файл .pfx") ($a.CertificateFormat -ne "pem")
        $pem = New-Radio (T "PEM files (certificate, key, CA)" "PEM файлове (сертификат, ключ, CA)") ($a.CertificateFormat -eq "pem")
        $format = New-Object System.Windows.Forms.FlowLayoutPanel
        $format.FlowDirection = "LeftToRight"; $format.Height = 36; $format.Controls.AddRange(@($pfx, $pem))
        Add-Field "" (T "Files from the hospital" "Файлове от болницата") $format $null -Wide -Row "Format"
        foreach ($radio in @($operator, $acme, $local, $pfx, $pem)) { $radio.Add_CheckedChanged({ Update-Rows }) }
        $script:ui["FormatPfx"] = $pfx
        Add-Field "PfxPath" (T ".pfx file" "Файл .pfx") (New-TextBox $a.PfxPath) (New-Browse "PfxPath" "Certificate with key (*.pfx;*.p12)|*.pfx;*.p12")
        Add-Field "PfxPassword" (T ".pfx password" "Парола на .pfx") (New-TextBox $a.PfxPassword -Secret) $null
        Add-Field "FullchainPath" (T "Certificate (PEM)" "Сертификат (PEM)") (New-TextBox $a.FullchainPath) (New-Browse "FullchainPath" "Certificate (*.pem;*.crt;*.cer)|*.pem;*.crt;*.cer|All files (*.*)|*.*")
        Add-Field "KeyPath" (T "Private key (PEM)" "Частен ключ (PEM)") (New-TextBox $a.KeyPath) (New-Browse "KeyPath" "Private key (*.key;*.pem)|*.key;*.pem|All files (*.*)|*.*")
        Add-Field "CaPath" (T "Authority (CA) certificate" "Сертификат на CA") (New-TextBox $a.CaPath) (New-Browse "CaPath" "Certificate (*.cer;*.crt;*.pem)|*.cer;*.crt;*.pem|All files (*.*)|*.*")
        Add-Note (T "The CA file is needed with PEM files, and with a .pfx only when the .pfx does not include the hospital's root authority. The certificate must cover both addresses." "Файлът на CA е нужен при PEM файлове, а при .pfx само ако той не съдържа коренния удостоверител на болницата. Сертификатът трябва да покрива и двата адреса.") -Row "CaNote"
        Add-Field "AcmeEmail" (T "Email for Let's Encrypt notices" "Имейл за известия от Let's Encrypt") (New-TextBox $a.AcmeEmail) $null
        Add-Note (T "Browsers and phones trust a local certificate only after IT installs the appliance's own authority on each device." "Браузърите и телефоните се доверяват на локален сертификат едва след като ИТ инсталира собствения удостоверител на системата на всяко устройство.") -Row "LocalNote"
      }
      "administrator" {
        $heading.Text = T "5. The LOSPOR administrator" "5. Администраторът на LOSPOR"
        Add-Note (T "The first person who signs in to Status and the clinical apps. One password for both." "Първият човек, който влиза в Status и в клиничните приложения. Една парола и за двете.")
        Add-Field "AdminEmail" (T "Email (Status sign-in)" "Имейл (вход в Status)") (New-TextBox $a.AdminEmail) $null
        Add-Field "AdminUsername" (T "Username (clinical apps)" "Потребителско име (клинични приложения)") (New-TextBox $a.AdminUsername) $null
        Add-Field "AdminFirstName" (T "First name" "Собствено име") (New-TextBox $a.AdminFirstName) $null
        Add-Field "AdminLastName" (T "Last name" "Фамилия") (New-TextBox $a.AdminLastName) $null
        Add-Field "AdminPassword" (T "Password" "Парола") (New-TextBox $a.AdminPassword -Secret) $null
        Add-Field "AdminPasswordRepeat" (T "Repeat it" "Повторете я") (New-TextBox $a.AdminPasswordRepeat -Secret) $null
        Add-Note (T "At least 8 characters with an uppercase letter, a number and a symbol, and different from the server password." "Поне 8 знака с главна буква, цифра и символ, и различна от паролата за сървъра.")
      }
      "summary" {
        $heading.Text = T "6. Check and install" "6. Проверка и инсталиране"
        Add-Note ((Get-SummaryLines) -join "`n")
        Add-Field "IsoPath" (T "Ubuntu ISO (empty: download)" "Ubuntu ISO (празно: изтегля се)") (New-TextBox $a.IsoPath) (New-Browse "IsoPath" "Ubuntu server ISO (*.iso)|*.iso")
        Add-Note (T "Installing takes about an hour and needs nothing from you. Keep this window open: it shows the progress and ends with the Go-live address." "Инсталирането отнема около час и не изисква нищо от вас. Оставете този прозорец отворен: той показва напредъка и завършва с адреса на страницата «Готовност».")
      }
    }
    Update-Rows
  }

  function Save-Page {
    $read = { param($Key) if ($script:ui.ContainsKey($Key)) { $control = $script:ui[$Key]; if ($control -is [System.Windows.Forms.NumericUpDown]) { return [int] $control.Value } if ($control -is [System.Windows.Forms.CheckBox]) { return $control.Checked } return ([string] $control.Text) } return $null }
    foreach ($key in @($script:ui.Keys)) {
      if (@("LocaleBg", "LocaleEn", "Switch", "TlsOperator", "TlsAcme", "FormatPfx") -contains $key) { continue }
      $a[$key] = & $read $key
    }
    if ($script:ui.ContainsKey("LocaleEn")) { $a.Locale = if ($script:ui["LocaleEn"].Checked) { "en" } else { "bg" }; $script:Locale = $a.Locale }
    if ($script:ui.ContainsKey("Switch") -and $script:ui["Switch"].SelectedIndex -ge 0) { $a.Switch = $switches[$script:ui["Switch"].SelectedIndex].Name }
    if ($script:ui.ContainsKey("TlsOperator")) { $a.TlsMode = if ($script:ui["TlsOperator"].Checked) { "operator" } elseif ($script:ui["TlsAcme"].Checked) { "acme" } else { "local" } }
    if ($script:ui.ContainsKey("FormatPfx")) { $a.CertificateFormat = if ($script:ui["FormatPfx"].Checked) { "pfx" } else { "pem" } }
  }

  $back.Add_Click({ Save-Page; $script:pageIndex--; Show-Page })
  $cancel.Add_Click({ $form.DialogResult = "Cancel"; $form.Close() })
  $next.Add_Click({
    Save-Page
    $page = $pages[$script:pageIndex]
    if ($page.Test) {
      $form.Cursor = "WaitCursor"
      try { $check = & $page.Test } finally { $form.Cursor = "Default" }
      if ($check.Errors.Count -gt 0) { $problems.Text = $check.Errors -join "`n"; return }
      if ($check.Warnings.Count -gt 0) {
        $answer = [System.Windows.Forms.MessageBox]::Show(($check.Warnings -join "`n`n") + "`n`n" + (T "Continue?" "Продължаване?"), (T "Please note" "Моля, обърнете внимание"), "YesNo", "Warning")
        if ($answer -ne "Yes") { return }
      }
    }
    if ($script:pageIndex -eq $pages.Count - 1) { $form.DialogResult = "OK"; $form.Close(); return }
    $script:pageIndex++
    Show-Page
  })

  if ($env:LOSPOR_WIZARD_SELFTEST -eq "1") {
    # Builds and reads back every page without showing the window.
    for ($script:pageIndex = 0; $script:pageIndex -lt $pages.Count; $script:pageIndex++) { Show-Page; if ($env:LOSPOR_WIZARD_SNAPSHOTS) { $form.Opacity = 0; $form.ShowInTaskbar = $false; $form.Show(); [System.Windows.Forms.Application]::DoEvents(); $bitmap = New-Object System.Drawing.Bitmap($form.Width, $form.Height); $form.DrawToBitmap($bitmap, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height))); $bitmap.Save((Join-Path $env:LOSPOR_WIZARD_SNAPSHOTS "$($script:pageIndex)-$($pages[$script:pageIndex].Id).png")); $bitmap.Dispose(); $form.Hide() }; Save-Page; Write-Host "selftest page $($pages[$script:pageIndex].Id): $($script:table.RowCount) rows" }
    $form.Dispose()
    return $false
  }
  Show-Page
  return ($form.ShowDialog() -eq "OK")
}

# ── install ─────────────────────────────────────────────────────────────────

function Test-AllPages {
  foreach ($page in $pages) {
    if (-not $page.Test) { continue }
    $check = & $page.Test
    if ($check.Errors.Count -gt 0) { return $check.Errors }
  }
  return @()
}

$serverCore = $false
try { $serverCore = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").InstallationType -eq "Server Core" } catch { $serverCore = $false }

if ($AnswersFile) {
  $errors = @(Test-AllPages)
  if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_ -ErrorAction Continue }; exit 1 }
} elseif ($Text -or $serverCore) {
  if (-not (Invoke-TextWizard)) { Write-Host (T "Nothing was created." "Нищо не е създадено."); exit 0 }
} else {
  if (-not (Invoke-WindowWizard)) { exit 0 }
}

$work = Join-Path $env:TEMP ("lospor-wizard-" + [guid]::NewGuid().ToString("N"))
$answersDirectory = Join-Path $work "answers"
New-Item -ItemType Directory -Path $answersDirectory -Force | Out-Null
# Administrators and SYSTEM only: this folder holds the passwords until the VM has them.
& icacls $work /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" /grant:r "*S-1-5-18:(OI)(CI)F" | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$write = { param($Name, $Value) [IO.File]::WriteAllText((Join-Path $answersDirectory $Name), $Value, $utf8) }
$secure = { param($Value) ConvertTo-SecureString -String $Value -AsPlainText -Force }
$resultPath = Join-Path $work "result.json"
$exitCode = 1
try {
  & $write "answers.env" (ConvertTo-LosporInstallAnswers (Get-KitAnswers))
  & $write "admin-password" "$($a.AdminPassword)`n"
  if ($a.TlsMode -eq "operator") {
    if ($a.CertificateFormat -eq "pfx") {
      Copy-Item -LiteralPath $a.PfxPath -Destination (Join-Path $answersDirectory "tls.pfx")
      & $write "tls.pfx-password" $a.PfxPassword
    } else {
      Copy-Item -LiteralPath $a.FullchainPath -Destination (Join-Path $answersDirectory "tls-fullchain.pem")
      Copy-Item -LiteralPath $a.KeyPath -Destination (Join-Path $answersDirectory "tls-private.key")
    }
    if ($a.CaPath -and (Test-Path -LiteralPath $a.CaPath -PathType Leaf)) {
      $caText = [IO.File]::ReadAllText($a.CaPath)
      if ($caText -notmatch '-----BEGIN CERTIFICATE-----') {
        # A DER .cer, as Windows exports it, written as PEM.
        $caCertificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $a.CaPath
        $caText = "-----BEGIN CERTIFICATE-----`n" + ([Convert]::ToBase64String($caCertificate.RawData, "InsertLineBreaks") -replace "`r`n", "`n") + "`n-----END CERTIFICATE-----`n"
      }
      & $write "tls-ca.pem" ($caText -replace "`r`n", "`n")
    }
  }
  $kitArguments = @{
    Name = $a.Name; SwitchName = $a.Switch; MemoryGB = [int] $a.MemoryGB; ProcessorCount = [int] $a.Cores; DiskGB = [int] $a.DiskGB
    VmDirectory = $a.VmDirectory; ConsolePassword = (& $secure $a.ConsolePassword)
    InstallAnswersDirectory = $answersDirectory; ResultPath = $resultPath
  }
  if ($a.Encrypt) { $kitArguments.EncryptDisk = $true; $kitArguments.DiskPassphrase = (& $secure $a.DiskPassphrase) }
  if (([string] $a.SshKey).Trim()) {
    $keyPath = Join-Path $work "authorized-key.pub"
    [IO.File]::WriteAllText($keyPath, ([string] $a.SshKey).Trim(), $utf8)
    $kitArguments.AuthorizedKeyPath = $keyPath
  }
  if ($release) { $kitArguments.ReleaseDirectory = $release.Folder }
  if ($a.IsoPath) { $kitArguments.IsoPath = $a.IsoPath } else { $kitArguments.DownloadDirectory = Join-Path (Split-Path $a.VmDirectory -Parent) "LOSPOR Ubuntu ISO" }

  Write-Host ""
  Write-Host (T "Creating the virtual machine. Keep this window open." "Създаване на виртуалната машина. Оставете този прозорец отворен.")
  try {
    & $kitScript @kitArguments
    $exitCode = $LASTEXITCODE
  } catch {
    # The kit reports its own refusals; anything else is written here the same way.
    $failure = [ordered] @{ state = "failed"; message = $_.Exception.Message; url = ""; vm = $a.Name; consoleUser = "lospor" }
    [IO.File]::WriteAllText($resultPath, ($failure | ConvertTo-Json), $utf8)
  }
} finally {
  # Overwritten, then deleted: the VM has its own copy now.
  Get-ChildItem -LiteralPath $answersDirectory -File -ErrorAction SilentlyContinue | ForEach-Object {
    try { [IO.File]::WriteAllBytes($_.FullName, (New-Object byte[] $_.Length)) } catch { }
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
}

$result = $null
if (Test-Path -LiteralPath $resultPath) { $result = Get-Content -Raw -Encoding UTF8 -LiteralPath $resultPath | ConvertFrom-Json }
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue

$installed = $result -and $result.state -eq "installed"
$message = if ($installed) {
  T "LOSPOR Hospital is installed.`n`nOpen $($result.url) and sign in with the administrator email and password. Go-live leads the rest of the way to clinical use.`n`nServer console: user lospor, with the server password." "LOSPOR Hospital е инсталиран.`n`nОтворете $($result.url) и влезте с имейла и паролата на администратора. Страницата «Готовност» води нататък до клинична употреба.`n`nКонзола на сървъра: потребител lospor, с паролата за сървъра."
} elseif ($result) {
  T "The installation did not finish.`n`n$($result.message)`n`nServer console: user lospor, with the server password." "Инсталацията не завърши.`n`n$($result.message)`n`nКонзола на сървъра: потребител lospor, с паролата за сървъра."
} else {
  T "The installation did not finish. The reason is printed in this window." "Инсталацията не завърши. Причината е изписана в този прозорец."
}
Write-Host ""
Write-Host $message
if ($AnswersFile -or $Text -or $serverCore) {
  if ($installed) { exit 0 } else { exit 1 }
}
Add-Type -AssemblyName System.Windows.Forms
if ($installed) {
  $open = [System.Windows.Forms.MessageBox]::Show($message + "`n`n" + (T "Open Go-live now?" "Да се отвори ли «Готовност» сега?"), "LOSPOR Hospital", "YesNo", "Information")
  if ($open -eq "Yes") { Start-Process $result.url }
  exit 0
}
[void] [System.Windows.Forms.MessageBox]::Show($message, "LOSPOR Hospital", "OK", "Error")
exit 1
