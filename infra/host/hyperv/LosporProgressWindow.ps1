<#
.SYNOPSIS
  The installation's progress, in the wizard's window.

.DESCRIPTION
  After the questions, the kit (New-LosporHospitalVm.ps1) runs in the
  background of this window, which shows where the installation is: the four
  stages with the one under way, a bar that keeps moving through long stages,
  the time so far, and, while LOSPOR installs, the server's own step. Its
  output is under "Show details". It ends with Go-live, or with why it
  stopped.

  Dot-sourced by Install-LosporHospital.ps1, whose T chooses the language.
#>

<#
  Runs the kit with these arguments while showing its progress. Returns its
  exit code, or $null when the window was closed before it finished.
#>
function Show-LosporInstallProgress {
  param(
    [Parameter(Mandatory = $true)] [string] $KitScript,
    [Parameter(Mandatory = $true)] [hashtable] $KitArguments,
    [Parameter(Mandatory = $true)] [string] $ProgressPath,
    [Parameter(Mandatory = $true)] [string] $ResultPath
  )
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()

  $stages = @(
    @{ Id = "prepare"; Label = (T "Preparing the Ubuntu installer" "Подготовка на инсталатора на Ubuntu"); Typical = (T "about 5 min" "около 5 min") },
    @{ Id = "ubuntu"; Label = (T "Installing Ubuntu" "Инсталиране на Ubuntu"); Typical = (T "15 to 20 min" "15 до 20 min") },
    @{ Id = "starting"; Label = (T "Starting the server" "Стартиране на сървъра"); Typical = (T "about 3 min" "около 3 min") },
    @{ Id = "lospor"; Label = (T "Installing LOSPOR Hospital" "Инсталиране на LOSPOR Hospital"); Typical = (T "10 to 40 min" "10 до 40 min") }
  )
  # The server's eight steps (lospor_progress in the installer scripts).
  $steps = @{
    "1" = (T "Getting the release" "Получаване на изданието")
    "2" = (T "Checking the release signature" "Проверка на подписа на изданието")
    "3" = (T "Loading the application images" "Зареждане на образите на приложението")
    "4" = (T "Starting the database" "Стартиране на базата данни")
    "5" = (T "Preparing the database" "Подготовка на базата данни")
    "6" = (T "Creating the administrator" "Създаване на администратора")
    "7" = (T "Loading the drug lists and code lists" "Зареждане на списъците с лекарства и кодове")
    "8" = (T "Starting LOSPOR and checking it is healthy" "Стартиране на LOSPOR и проверка на работата му")
  }

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "LOSPOR Hospital"
  $form.Size = New-Object System.Drawing.Size(820, 640)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

  $heading = New-Object System.Windows.Forms.Label
  $heading.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
  $heading.Location = New-Object System.Drawing.Point(16, 12); $heading.Size = New-Object System.Drawing.Size(770, 34)
  $heading.Text = T "Installing LOSPOR Hospital" "Инсталиране на LOSPOR Hospital"
  $intro = New-Object System.Windows.Forms.Label
  $intro.Location = New-Object System.Drawing.Point(18, 50); $intro.Size = New-Object System.Drawing.Size(770, 42)
  $intro.Text = T "This takes about an hour and needs nothing from you. Keep this window open; you can work on something else meanwhile." "Това отнема около час и не изисква нищо от вас. Оставете този прозорец отворен; междувременно може да вършите друго."

  # One row per stage: a mark, its name, and how long it usually takes.
  $rows = @()
  for ($index = 0; $index -lt $stages.Count; $index++) {
    $y = 102 + 30 * $index
    $mark = New-Object System.Windows.Forms.Label
    $mark.Location = New-Object System.Drawing.Point(18, $y); $mark.Size = New-Object System.Drawing.Size(26, 26)
    $mark.Font = New-Object System.Drawing.Font("Segoe UI Symbol", 11)
    $name = New-Object System.Windows.Forms.Label
    $name.Location = New-Object System.Drawing.Point(46, $y); $name.Size = New-Object System.Drawing.Size(520, 26)
    $name.Text = $stages[$index].Label
    $typical = New-Object System.Windows.Forms.Label
    $typical.Location = New-Object System.Drawing.Point(580, $y); $typical.Size = New-Object System.Drawing.Size(200, 26)
    $typical.TextAlign = "TopRight"; $typical.ForeColor = [System.Drawing.Color]::DimGray
    $typical.Text = $stages[$index].Typical
    $form.Controls.AddRange(@($mark, $name, $typical))
    $rows += @{ Mark = $mark; Name = $name }
  }

  $bar = New-Object System.Windows.Forms.ProgressBar
  $bar.Location = New-Object System.Drawing.Point(18, 232); $bar.Size = New-Object System.Drawing.Size(766, 26)
  $bar.Style = "Continuous"; $bar.Minimum = 0; $bar.Maximum = 1000
  $now = New-Object System.Windows.Forms.Label
  $now.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
  $now.Location = New-Object System.Drawing.Point(18, 266); $now.Size = New-Object System.Drawing.Size(600, 26)
  $elapsed = New-Object System.Windows.Forms.Label
  $elapsed.Location = New-Object System.Drawing.Point(620, 266); $elapsed.Size = New-Object System.Drawing.Size(164, 26)
  $elapsed.TextAlign = "TopRight"; $elapsed.ForeColor = [System.Drawing.Color]::DimGray
  $detail = New-Object System.Windows.Forms.Label
  $detail.Location = New-Object System.Drawing.Point(18, 294); $detail.Size = New-Object System.Drawing.Size(766, 60)
  $detail.ForeColor = [System.Drawing.Color]::DimGray

  $showDetails = New-Object System.Windows.Forms.CheckBox
  $showDetails.Location = New-Object System.Drawing.Point(18, 358); $showDetails.Size = New-Object System.Drawing.Size(300, 24)
  $showDetails.Text = T "Show details" "Подробности"
  $log = New-Object System.Windows.Forms.TextBox
  $log.Location = New-Object System.Drawing.Point(18, 386); $log.Size = New-Object System.Drawing.Size(766, 140)
  $log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = "Vertical"; $log.WordWrap = $true
  $log.Font = New-Object System.Drawing.Font("Consolas", 9); $log.Visible = $false
  $showDetails.add_CheckedChanged({ $log.Visible = $showDetails.Checked })

  $goLive = New-Object System.Windows.Forms.Button
  $goLive.Location = New-Object System.Drawing.Point(428, 548); $goLive.Size = New-Object System.Drawing.Size(240, 36)
  $goLive.Text = T "Open Go-live" "Отваряне на «Пускане в работа»"; $goLive.Visible = $false
  $close = New-Object System.Windows.Forms.Button
  $close.Location = New-Object System.Drawing.Point(684, 548); $close.Size = New-Object System.Drawing.Size(100, 36)
  $close.Text = T "Close" "Затваряне"
  $close.add_Click({ $form.Close() })
  $form.Controls.AddRange(@($heading, $intro, $bar, $now, $elapsed, $detail, $showDetails, $log, $goLive, $close))

  # ── the kit, in the background ─────────────────────────────────────────────
  $session = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
  $session.ExecutionPolicy = [Microsoft.PowerShell.ExecutionPolicy]::Bypass
  $runspace = [runspacefactory]::CreateRunspace($session)
  $runspace.Open()
  $shell = [powershell]::Create()
  $shell.Runspace = $runspace
  $arguments = $KitArguments.Clone()
  $arguments.ProgressPath = $ProgressPath
  $arguments.ResultPath = $ResultPath
  [void] $shell.AddScript({
    param($Script, $Arguments)
    & $Script @Arguments
    if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
  }).AddArgument($KitScript).AddArgument($arguments)
  $handle = $shell.BeginInvoke()

  $state = @{
    Stage = "prepare"; Step = ""; Message = ""; Since = Get-Date; Started = Get-Date; Shown = 0.0
    Done = $false; Failed = $false; ExitCode = $null; Url = ""; Seen = @{ Information = 0; Warning = 0; Error = 0 }; Ticks = 0
  }
  # "12 min", "1 h 05 min": units as the rest of LOSPOR writes them, in either language.
  $minutes = { param([TimeSpan] $Span)
    $whole = [int] [Math]::Floor($Span.TotalMinutes)
    if ($whole -lt 60) { return "$whole min" }
    return "{0} h {1:00} min" -f [int] [Math]::Floor($whole / 60), ($whole % 60)
  }

  # The kit's output, as the console used to show it.
  $drain = {
    $lines = New-Object System.Collections.Generic.List[string]
    $information = $shell.Streams.Information
    for ($i = $state.Seen.Information; $i -lt $information.Count; $i++) { $lines.Add([string] $information[$i].MessageData) }
    $state.Seen.Information = $information.Count
    $warnings = $shell.Streams.Warning
    for ($i = $state.Seen.Warning; $i -lt $warnings.Count; $i++) { $lines.Add("WARNING: " + $warnings[$i].Message) }
    $state.Seen.Warning = $warnings.Count
    $errors = $shell.Streams.Error
    for ($i = $state.Seen.Error; $i -lt $errors.Count; $i++) { $lines.Add("ERROR: " + $errors[$i].ToString()) }
    $state.Seen.Error = $errors.Count
    if ($lines.Count -gt 0) { $log.AppendText(($lines -join "`r`n") + "`r`n") }
  }

  $show = {
    $current = [Array]::IndexOf(@($stages | ForEach-Object { $_.Id }), $state.Stage)
    for ($index = 0; $index -lt $rows.Count; $index++) {
      $row = $rows[$index]
      if ($state.Stage -eq "installed" -or $index -lt $current) {
        $row.Mark.Text = [string] [char] 0x2714; $row.Mark.ForeColor = [System.Drawing.Color]::ForestGreen
        $row.Name.Font = $form.Font
      } elseif ($index -eq $current -and $state.Failed) {
        $row.Mark.Text = [string] [char] 0x2716; $row.Mark.ForeColor = [System.Drawing.Color]::Firebrick
        $row.Name.Font = New-Object System.Drawing.Font($form.Font, [System.Drawing.FontStyle]::Bold)
      } elseif ($index -eq $current -and -not $state.Done) {
        $row.Mark.Text = [string] [char] 0x25B6; $row.Mark.ForeColor = [System.Drawing.Color]::RoyalBlue
        $row.Name.Font = New-Object System.Drawing.Font($form.Font, [System.Drawing.FontStyle]::Bold)
      } else {
        $row.Mark.Text = [string] [char] 0x25CB; $row.Mark.ForeColor = [System.Drawing.Color]::Silver
        $row.Name.Font = $form.Font
      }
    }
    $sinceStage = (Get-Date) - $state.Since
    $fraction = Get-LosporProgressFraction $state.Stage $sinceStage.TotalSeconds $state.Step
    # Never backwards: a new stage's estimate can start below the last one's.
    if ($fraction -gt $state.Shown) { $state.Shown = $fraction }
    $bar.Value = [int] [Math]::Round([Math]::Min(1.0, [double] $state.Shown) * 1000.0)
    $elapsed.Text = (T "Time so far" "Изминало време") + " " + (& $minutes ((Get-Date) - $state.Started))
    if ($state.Done) { return }
    $label = if ($current -ge 0) { $stages[$current].Label } else { T "Starting" "Начало" }
    if ($state.Stage -eq "lospor" -and $state.Step -match '^(\d+)/(\d+)$' -and [int] $Matches[1] -gt 0) {
      $number = $Matches[1]; $of = $Matches[2]
      $label = (T "Step $number of $($of)" "Стъпка $number от $of") + ": " + $(if ($steps.ContainsKey($number)) { $steps[$number] } else { $state.Message })
    }
    $now.Text = $label + " (" + (& $minutes $sinceStage) + ")"
    $detail.Text = $state.Message
  }

  $finish = {
    $state.Done = $true
    # Over: how long it takes no longer applies.
    $intro.Visible = $false
    try {
      $output = @($shell.EndInvoke($handle))
      $state.ExitCode = if ($output.Count -gt 0) { [int] $output[-1] } else { 0 }
    } catch {
      $state.ExitCode = 1
      $log.AppendText("ERROR: " + $_.Exception.Message + "`r`n")
      $failure = [ordered] @{ state = "failed"; message = $_.Exception.Message; url = ""; vm = $KitArguments.Name; consoleUser = "lospor" }
      try { [IO.File]::WriteAllText($ResultPath, ($failure | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false))) } catch { }
    }
    & $drain
    $result = $null
    if (Test-Path -LiteralPath $ResultPath) { try { $result = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResultPath | ConvertFrom-Json } catch { $result = $null } }
    if ($result -and $result.state -eq "installed") {
      $state.Stage = "installed"; $state.Url = [string] $result.url
      $heading.Text = T "LOSPOR Hospital is installed" "LOSPOR Hospital е инсталиран"
      $now.Text = T "Installed." "Инсталирано."; $now.ForeColor = [System.Drawing.Color]::ForestGreen
      $detail.Text = T "Open $($state.Url) and sign in with the administrator email and password. Go-live leads the rest of the way to clinical use. Server console: user lospor, with the server password." "Отворете $($state.Url) и влезте с имейла и паролата на администратора. Страницата «Пускане в работа» води нататък до клинична употреба. Конзола на сървъра: потребител lospor, с паролата за сървъра."
      $goLive.Visible = $true
    } else {
      $state.Failed = $true
      $heading.Text = T "The installation did not finish" "Инсталацията не завърши"
      $now.Text = T "Stopped." "Спряна."; $now.ForeColor = [System.Drawing.Color]::Firebrick
      $detail.Text = $(if ($result) { [string] $result.message } else { T "The reason is under Show details." "Причината е в «Подробности»." }) + " " + (T "Server console: user lospor, with the server password." "Конзола на сървъра: потребител lospor, с паролата за сървъра.")
      $showDetails.Checked = $true
    }
    & $show
    $shell.Dispose(); $runspace.Dispose()
  }

  $goLive.add_Click({ if ($state.Url) { Start-Process $state.Url } })

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 1000
  $timer.add_Tick({
    if ($state.Done) { return }
    if (Test-Path -LiteralPath $ProgressPath) {
      try {
        $progress = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProgressPath | ConvertFrom-Json
        $stage = [string] $progress.stage; $step = [string] $progress.step
        if (@($stages | ForEach-Object { $_.Id }) -contains $stage) {
          if ($stage -ne $state.Stage -or $step -ne $state.Step) { $state.Since = Get-Date }
          $state.Stage = $stage; $state.Step = $step
        }
        $state.Message = [string] $progress.message
      } catch { }
    }
    & $drain
    if ($handle.IsCompleted) { & $finish } else { & $show }
    # The wizard's own snapshots (LOSPOR_WIZARD_SNAPSHOTS): every few seconds, then close when done.
    $state.Ticks++
    if ($env:LOSPOR_WIZARD_SNAPSHOTS -and ($state.Done -or $state.Ticks % 3 -eq 0)) {
      $bitmap = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
      $form.DrawToBitmap($bitmap, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
      $bitmap.Save((Join-Path $env:LOSPOR_WIZARD_SNAPSHOTS ("progress-{0:000}.png" -f $state.Ticks))); $bitmap.Dispose()
      if ($state.Done) { $form.Close() }
    }
  })

  $form.add_FormClosing({
    param($source, $closing)
    if ($state.Done -or $env:LOSPOR_WIZARD_SNAPSHOTS) { return }
    $answer = [System.Windows.Forms.MessageBox]::Show(
      (T "The installation is still running. If you close this window, this computer stops following it: the installation media are not removed and the server is not started for you. Close anyway?" "Инсталацията продължава. Ако затворите прозореца, този компютър спира да я следи: инсталационните носители не се премахват и сървърът не се стартира вместо вас. Да се затвори ли все пак?"),
      "LOSPOR Hospital", "YesNo", "Warning")
    if ($answer -ne "Yes") { $closing.Cancel = $true; return }
    $timer.Stop()
    try { [void] $shell.BeginStop($null, $null) } catch { }
  })

  & $show
  $timer.Start()
  [void] $form.ShowDialog()
  $timer.Stop()
  return $state.ExitCode
}
