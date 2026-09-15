<#
  What New-LosporHospitalVm.ps1 writes onto the seed disk: the autoinstall seed
  with this VM's one-time password, the SSH key, the disk passphrase and the
  LOSPOR installer filled in.

  Kept apart from the kit because none of it needs Hyper-V or an elevated
  shell, so scripts/host-kit.test.mjs runs it on any machine with PowerShell.

  Dot-sourced by New-LosporHospitalVm.ps1; it defines functions and runs nothing.
#>

$LosporCryptAlphabet = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function Get-LosporRandomText([string] $Alphabet, [int] $Length) {
  # Rejection sampling, so every character is equally likely.
  $random = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  try {
    $limit = 256 - (256 % $Alphabet.Length)
    $byte = New-Object byte[] 1
    $text = New-Object System.Text.StringBuilder
    while ($text.Length -lt $Length) {
      $random.GetBytes($byte)
      if ($byte[0] -lt $limit) { [void] $text.Append($Alphabet[$byte[0] % $Alphabet.Length]) }
    }
    return $text.ToString()
  } finally { $random.Dispose() }
}

<#
  A password typed once at the Hyper-V console: lowercase letters and digits
  that look unlike each other and sit where the US keyboard layout puts them,
  in four groups of five (about 99 bits).
#>
function New-LosporOneTimePassword {
  $text = Get-LosporRandomText "abcdefghjkmnpqrstuvwxyz23456789" 20
  return "$($text.Substring(0, 5))-$($text.Substring(5, 5))-$($text.Substring(10, 5))-$($text.Substring(15, 5))"
}

<#
  Ubuntu's installer takes the password as a SHA-512 crypt hash ($6$), and
  Windows PowerShell 5.1 has no crypt, so the scheme is written out as its
  specification describes it (Ulrich Drepper, "Unix crypt using SHA-256 and
  SHA-512", default 5000 rounds), and tested against the specification's own
  vector and OpenSSL.
#>
function ConvertTo-LosporSha512Crypt([string] $Password, [string] $Salt) {
  if (-not $Salt) { $Salt = Get-LosporRandomText $LosporCryptAlphabet 16 }
  if ($Salt.Length -gt 16) { $Salt = $Salt.Substring(0, 16) }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $p = $utf8.GetBytes($Password)
  $s = $utf8.GetBytes($Salt)

  $digest = {
    param([byte[][]] $Parts)
    $sha = [System.Security.Cryptography.SHA512]::Create()
    try {
      foreach ($part in $Parts) { [void] $sha.TransformBlock($part, 0, $part.Length, $null, 0) }
      [void] $sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
      return ,$sha.Hash
    } finally { $sha.Dispose() }
  }
  # The first $Length bytes of $Source repeated.
  $repeatTo = {
    param([byte[]] $Source, [int] $Length)
    $out = New-Object byte[] $Length
    for ($i = 0; $i -lt $Length; $i++) { $out[$i] = $Source[$i % $Source.Length] }
    return ,$out
  }

  $b = & $digest @($p, $s, $p)
  $parts = New-Object System.Collections.Generic.List[byte[]]
  $parts.Add($p); $parts.Add($s)
  if ($p.Length -gt 0) { $parts.Add((& $repeatTo $b $p.Length)) }
  for ($n = $p.Length; $n -gt 0; $n = $n -shr 1) {
    if ($n -band 1) { $parts.Add($b) } else { $parts.Add($p) }
  }
  $a = & $digest $parts.ToArray()

  $dpParts = New-Object System.Collections.Generic.List[byte[]]
  for ($i = 0; $i -lt $p.Length; $i++) { $dpParts.Add($p) }
  $dp = & $digest $dpParts.ToArray()
  $pBytes = if ($p.Length -gt 0) { & $repeatTo $dp $p.Length } else { New-Object byte[] 0 }

  $dsParts = New-Object System.Collections.Generic.List[byte[]]
  for ($i = 0; $i -lt (16 + $a[0]); $i++) { $dsParts.Add($s) }
  $ds = & $digest $dsParts.ToArray()
  $sBytes = & $repeatTo $ds $s.Length

  $sha = [System.Security.Cryptography.SHA512]::Create()
  try {
    $empty = New-Object byte[] 0
    for ($round = 0; $round -lt 5000; $round++) {
      $odd = ($round % 2) -eq 1
      $first = if ($odd) { $pBytes } else { $a }
      [void] $sha.TransformBlock($first, 0, $first.Length, $null, 0)
      if ($round % 3 -ne 0) { [void] $sha.TransformBlock($sBytes, 0, $sBytes.Length, $null, 0) }
      if ($round % 7 -ne 0) { [void] $sha.TransformBlock($pBytes, 0, $pBytes.Length, $null, 0) }
      $last = if ($odd) { $a } else { $pBytes }
      [void] $sha.TransformBlock($last, 0, $last.Length, $null, 0)
      [void] $sha.TransformFinalBlock($empty, 0, 0)
      $a = $sha.Hash
      $sha.Initialize()
    }
  } finally { $sha.Dispose() }

  $order = @(0,21,42, 22,43,1, 44,2,23, 3,24,45, 25,46,4, 47,5,26, 6,27,48, 28,49,7, 50,8,29, 9,30,51,
    31,52,10, 53,11,32, 12,33,54, 34,55,13, 56,14,35, 15,36,57, 37,58,16, 59,17,38, 18,39,60, 40,61,19, 62,20,41)
  $encoded = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $order.Length; $i += 3) {
    $w = ([int] $a[$order[$i]] -shl 16) -bor ([int] $a[$order[$i + 1]] -shl 8) -bor [int] $a[$order[$i + 2]]
    for ($c = 0; $c -lt 4; $c++) { [void] $encoded.Append($LosporCryptAlphabet[$w -band 63]); $w = $w -shr 6 }
  }
  $w = [int] $a[63]
  for ($c = 0; $c -lt 2; $c++) { [void] $encoded.Append($LosporCryptAlphabet[$w -band 63]); $w = $w -shr 6 }
  return "`$6`$$Salt`$$($encoded.ToString())"
}

<#
  The seed with everything specific to this VM filled in. Each part is filled
  only where the seed has its place, and the result says which were, so a
  seed edited by hand is reported rather than silently left incomplete.
#>
function ConvertTo-LosporSeed {
  param(
    [Parameter(Mandatory = $true)] [string] $Seed,
    [Parameter(Mandatory = $true)] [string] $Bootstrap,
    [Parameter(Mandatory = $true)] [string] $PasswordHash,
    [string] $AuthorizedKey,
    [string] $DiskPassphrase,
    # lospor-firstboot.sh: given, the server installs LOSPOR at first boot from
    # the answers the wizard put on the seed disk.
    [string] $Firstboot,
    # The console password was chosen by a person, so it is not expired.
    [switch] $ChosenPassword
  )
  # cloud-init needs LF, and a checkout on Windows may have CRLF, which sh on
  # Ubuntu cannot run either.
  $text = $Seed -replace "`r`n", "`n"
  $bootstrapBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes(($Bootstrap -replace "`r`n", "`n"))

  # The installer, written onto the new system and checked there against the
  # SHA-256 of the copy the kit read.
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try { $bootstrapSha = -join ($sha256.ComputeHash($bootstrapBytes) | ForEach-Object { $_.ToString("x2") }) } finally { $sha256.Dispose() }
  $target = "/target/usr/local/lib/lospor/losporctl-install.sh"
  $command = "    - |`n      set -e`n      install -d -m 0755 /target/usr/local/lib/lospor`n" +
    "      printf '%s' '$([Convert]::ToBase64String($bootstrapBytes))' | base64 -d > $target`n" +
    "      printf '%s  %s\n' '$bootstrapSha' $target | sha256sum -c --quiet -`n" +
    "      chmod 0755 $target`n"
  $marker = "    # lospor-kit: bootstrap`n"
  $carriesBootstrap = $text.Contains($marker)
  if ($carriesBootstrap) { $text = $text.Replace($marker, $command) }

  $placeholder = 'password: "LOSPOR_PASSWORD_HASH"'
  $setsPassword = $text.Contains($placeholder)
  if ($setsPassword) { $text = $text.Replace($placeholder, "password: `"$PasswordHash`"") }

  if ($AuthorizedKey) {
    $text = $text.Replace("    authorized-keys: []", "    authorized-keys:`n      - `"$AuthorizedKey`"")
    # An expired password would refuse the key until someone had used the console.
    $text = $text.Replace("    - curtin in-target -- chage -d 0 lospor # lospor-kit: expire`n", "")
  }
  if ($DiskPassphrase) {
    $text = $text.Replace("    layout:`n      name: lvm`n      sizing-policy: all",
      "    layout:`n      name: lvm`n      sizing-policy: all`n      password: `"$DiskPassphrase`"")
  }
  if ($ChosenPassword) {
    $text = $text.Replace("    - curtin in-target -- chage -d 0 lospor # lospor-kit: expire`n", "")
  }

  $firstbootMarker = "    # lospor-kit: firstboot`n"
  $carriesFirstboot = $false
  if ($Firstboot -and $text.Contains($firstbootMarker)) {
    $text = $text.Replace($firstbootMarker, (ConvertTo-LosporFirstbootCommand $Firstboot))
    $carriesFirstboot = $true
  } else {
    $text = $text.Replace($firstbootMarker, "")
  }
  return [pscustomobject] @{ Text = $text; CarriesBootstrap = $carriesBootstrap; SetsPassword = $setsPassword; CarriesFirstboot = $carriesFirstboot }
}

<#
  The late-command that makes the new system install LOSPOR at its first boot:
  the first-boot script and its service, and the wizard's answers copied from
  the seed disk's lospor folder, root-only. The answers are files beside
  user-data, never inside it: Ubuntu's installer keeps user-data in its logs.
#>
function ConvertTo-LosporFirstbootCommand([string] $Firstboot) {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $scriptBytes = $utf8.GetBytes(($Firstboot -replace "`r`n", "`n"))
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try { $scriptSha = -join ($sha256.ComputeHash($scriptBytes) | ForEach-Object { $_.ToString("x2") }) } finally { $sha256.Dispose() }
  $unit = "[Unit]`n" +
    "Description=LOSPOR Hospital first installation from the Windows wizard's answers`n" +
    "ConditionPathExists=/var/lib/lospor-firstboot/answers.env`n" +
    "Wants=network-online.target`n" +
    "After=network-online.target docker.service hv-kvp-daemon.service`n`n" +
    "[Service]`nType=oneshot`nExecStart=/bin/sh /usr/local/lib/lospor/lospor-firstboot.sh`nTimeoutStartSec=4h`n`n" +
    "[Install]`nWantedBy=multi-user.target`n"
  $script = "/target/usr/local/lib/lospor/lospor-firstboot.sh"
  $service = "/target/etc/systemd/system/firstboot-lospor.service"
  return "    - |`n      set -e`n      install -d -m 0755 /target/usr/local/lib/lospor`n" +
    "      printf '%s' '$([Convert]::ToBase64String($scriptBytes))' | base64 -d > $script`n" +
    "      printf '%s  %s\n' '$scriptSha' $script | sha256sum -c --quiet -`n" +
    "      chmod 0755 $script`n" +
    "      printf '%s' '$([Convert]::ToBase64String($utf8.GetBytes($unit)))' | base64 -d > $service`n" +
    "      chmod 0644 $service`n" +
    "      mkdir -p /run/lospor-answers`n" +
    "      mount -t vfat -o ro /dev/disk/by-label/CIDATA /run/lospor-answers`n" +
    "      test -f /run/lospor-answers/lospor/answers.env`n" +
    "      install -d -m 0700 /target/var/lib/lospor-firstboot`n" +
    "      for answer in /run/lospor-answers/lospor/*; do install -m 0600 `"`$answer`" /target/var/lib/lospor-firstboot/; done`n" +
    "      umount /run/lospor-answers`n" +
    "    - curtin in-target -- systemctl enable firstboot-lospor.service`n"
}

# ── the wizard's answers ────────────────────────────────────────────────────

<#
  What the installer will be told, checked before anything is created, with the
  same rules the server applies (install-guided.sh, lospor-firstboot.sh and the
  appliance's password policy). Each problem names its field, in English and
  Bulgarian.
#>
function Test-LosporInstallAnswers([hashtable] $Answers) {
  $problems = New-Object System.Collections.Generic.List[object]
  $add = { param($Field, $En, $Bg) $problems.Add([pscustomobject] @{ Field = $Field; En = $En; Bg = $Bg }) }
  $value = { param($Key) if ($Answers.ContainsKey($Key) -and $null -ne $Answers[$Key]) { ([string] $Answers[$Key]).Trim() } else { "" } }
  $hostname = '^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,62}$'

  if (@("bg", "en") -notcontains (& $value "Locale")) { & $add "Locale" "Choose Bulgarian or English." "Изберете български или английски." }
  $clinical = & $value "ClinicalDomain"
  $research = & $value "ResearchDomain"
  if ($clinical -notmatch $hostname) { & $add "ClinicalDomain" "The clinical address must be a full DNS name, for example lospor.hospital.bg." "Клиничният адрес трябва да е пълно DNS име, например lospor.hospital.bg." }
  if ($research -notmatch $hostname) { & $add "ResearchDomain" "The research address must be a full DNS name, for example lospor-research.hospital.bg." "Адресът за изследвания трябва да е пълно DNS име, например lospor-research.hospital.bg." }
  if ($clinical -and $clinical -eq $research) { & $add "ResearchDomain" "The research address must differ from the clinical address." "Адресът за изследвания трябва да е различен от клиничния." }
  $mode = & $value "TlsMode"
  if (@("operator", "acme", "local") -notcontains $mode) { & $add "TlsMode" "Choose how the certificate is provided." "Изберете как се осигурява сертификатът." }
  if ($mode -eq "acme" -and (& $value "AcmeEmail") -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { & $add "AcmeEmail" "Let's Encrypt needs an email address for its notices." "Let's Encrypt изисква имейл адрес за известията." }
  foreach ($field in @(
      @("HospitalName", "Hospital name", "Име на болницата"),
      @("HospitalCity", "City", "Град"),
      @("AdminFirstName", "Administrator's first name", "Собствено име на администратора"),
      @("AdminLastName", "Administrator's last name", "Фамилия на администратора"))) {
    $text = & $value $field[0]
    if (-not $text) { & $add $field[0] "$($field[1]) is required." "$($field[2]) е задължително." }
    elseif ($text.Length -gt 256 -or $text -match '[''"\\$`]' -or $text -match '[\x00-\x1f]') { & $add $field[0] "$($field[1]) may not contain quotes, backslashes, dollar signs or backticks." "$($field[2]) не може да съдържа кавички, обратни наклонени черти, знак за долар или обратни апострофи." }
  }
  if ((& $value "AdminEmail") -notmatch '^[^\s@''"\\$`]+@[^\s@''"\\$`]+\.[^\s@''"\\$`]+$') { & $add "AdminEmail" "The administrator email is not a valid address." "Имейлът на администратора не е валиден адрес." }
  if ((& $value "AdminUsername") -cnotmatch '^[A-Za-z][A-Za-z0-9._-]{2,63}$') { & $add "AdminUsername" "The username needs 3 to 64 characters: a Latin letter first, then Latin letters, numbers, dots, dashes or underscores." "Потребителското име трябва да е от 3 до 64 знака: първо латинска буква, след това латински букви, цифри, точки, тирета или долни черти." }
  $version = & $value "ReleaseVersion"
  if ($version -and $version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { & $add "ReleaseVersion" "The release version is not valid." "Версията на изданието не е валидна." }
  return ,$problems.ToArray()
}

<# The appliance's password policy: 8 to 256 characters, an uppercase letter, a number and a symbol. #>
function Test-LosporAdminPassword([string] $Password) {
  $missing = New-Object System.Collections.Generic.List[object]
  if ($Password.Length -lt 8 -or $Password.Length -gt 256) { $missing.Add([pscustomobject] @{ En = "8 to 256 characters"; Bg = "от 8 до 256 знака" }) }
  if ($Password -cnotmatch '[A-Z]') { $missing.Add([pscustomobject] @{ En = "an uppercase letter"; Bg = "главна буква" }) }
  if ($Password -notmatch '[0-9]') { $missing.Add([pscustomobject] @{ En = "a number"; Bg = "цифра" }) }
  if ($Password -notmatch '[^A-Za-z0-9]') { $missing.Add([pscustomobject] @{ En = "a symbol"; Bg = "символ" }) }
  if ($Password -match '[\r\n]') { $missing.Add([pscustomobject] @{ En = "no line breaks"; Bg = "без нов ред" }) }
  return ,$missing.ToArray()
}

<# answers.env as lospor-firstboot.sh reads it: a header, then KEY=value lines, LF. #>
function ConvertTo-LosporInstallAnswers([hashtable] $Answers) {
  $map = [ordered] @{
    LOSPOR_DEFAULT_LOCALE = "Locale"; LOSPOR_RELEASE_VERSION = "ReleaseVersion"
    HOSPITAL_CLINICAL_DOMAIN = "ClinicalDomain"; HOSPITAL_RESEARCH_DOMAIN = "ResearchDomain"
    HOSPITAL_TLS_MODE = "TlsMode"; ACME_EMAIL = "AcmeEmail"
    HOSPITAL_INSTITUTION_NAME = "HospitalName"; HOSPITAL_INSTITUTION_CITY = "HospitalCity"
    HOSPITAL_BOOTSTRAP_ADMIN_EMAIL = "AdminEmail"; HOSPITAL_BOOTSTRAP_ADMIN_USERNAME = "AdminUsername"
    HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME = "AdminFirstName"; HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME = "AdminLastName"
  }
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("LOSPOR-HOSPITAL-INSTALL-ANSWERS-V1")
  foreach ($key in $map.Keys) {
    $name = $map[$key]
    if (-not $Answers.ContainsKey($name) -or -not ([string] $Answers[$name]).Trim()) { continue }
    if ($key -eq "ACME_EMAIL" -and $Answers["TlsMode"] -ne "acme") { continue }
    $lines.Add("$key=$(([string] $Answers[$name]).Trim())")
  }
  return ($lines -join "`n") + "`n"
}

<#
  The guest's key-value items, as Hyper-V returns them (Msvm_KvpExchangeDataItem
  XML), as a name-to-value table.
#>
function ConvertFrom-LosporKvpItems([string[]] $Items) {
  $table = @{}
  foreach ($item in @($Items)) {
    if (-not $item) { continue }
    try { $xml = [xml] $item } catch { continue }
    $name = $null; $data = $null
    foreach ($property in $xml.INSTANCE.PROPERTY) {
      if ($property.NAME -eq "Name") { $name = [string] $property.VALUE }
      if ($property.NAME -eq "Data") { $data = [string] $property.VALUE }
    }
    if ($name) { $table[$name] = $data }
  }
  return $table
}

<#
  A hospital .pfx, read on Windows before anything is created: whether it holds
  a server certificate with its key for both names, how long it is valid, and
  whether the hospital's root authority is inside it.
#>
function Get-LosporPfxSummary([string] $Path, [string] $Password, [string[]] $Names) {
  $collection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet
  $ephemeral = [Enum]::GetNames([System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]) -contains "EphemeralKeySet"
  if ($ephemeral) { $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet }
  try { $collection.Import($Path, $Password, $flags) } catch { return [pscustomobject] @{ Opened = $false } }
  $leaf = $null; $hasRoot = $false
  foreach ($certificate in $collection) {
    if ($certificate.HasPrivateKey -and -not $leaf) { $leaf = $certificate }
    if ($certificate.Subject -eq $certificate.Issuer -and -not $certificate.HasPrivateKey) { $hasRoot = $true }
  }
  $dnsNames = @()
  if ($leaf) {
    foreach ($extension in $leaf.Extensions) {
      if ($extension.Oid.Value -eq "2.5.29.17") {
        $dnsNames = @([regex]::Matches($extension.Format($false), 'DNS Name=([^,\s]+)') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() })
      }
    }
  }
  $covered = { param($Name) $lower = $Name.ToLowerInvariant(); foreach ($dns in $dnsNames) { if ($dns -eq $lower) { return $true }; if ($dns.StartsWith("*.") -and $lower.EndsWith($dns.Substring(1)) -and ($lower.Split(".").Count -eq $dns.Split(".").Count)) { return $true } }; return $false }
  $missing = @($Names | Where-Object { $_ -and -not (& $covered $_) })
  return [pscustomobject] @{
    Opened = $true
    HasKey = [bool] $leaf
    MissingNames = $missing
    NotAfter = if ($leaf) { $leaf.NotAfter } else { $null }
    HasRoot = $hasRoot
  }
}
