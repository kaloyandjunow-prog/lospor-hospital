@echo off
rem LOSPOR Hospital: installs a new server on this Hyper-V host.
rem Runs the wizard with PowerShell for this window only; it asks for administrator rights.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\host\hyperv\Install-LosporHospital.ps1" %*
if errorlevel 1 pause
