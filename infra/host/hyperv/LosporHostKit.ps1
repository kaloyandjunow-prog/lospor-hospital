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
    [string] $DiskPassphrase
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
  return [pscustomobject] @{ Text = $text; CarriesBootstrap = $carriesBootstrap; SetsPassword = $setsPassword }
}
