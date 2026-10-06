# Installs the Spotify watcher as a Windows scheduled task that starts at every logon, and starts it now.
# Copies the watcher out of the plugin folder first, so a plugin update or reinstall cannot break the task.
# Remove it again with:  Unregister-ScheduledTask -TaskName 'Clawd Spotify Watch' -Confirm:$false
param(
    [Parameter(Mandatory)][string]$StatusFile
)

$ErrorActionPreference = 'Stop'
$task = 'Clawd Spotify Watch'
$home_ = Join-Path $env:LOCALAPPDATA 'clawd-vibe'
New-Item -ItemType Directory -Force $home_ | Out-Null
$script = Join-Path $home_ 'clawd-spotify-watch.ps1'
Copy-Item -Force (Join-Path $PSScriptRoot 'clawd-spotify-watch.ps1') $script

# powershell.exe is a console app, so even -WindowStyle Hidden flashes a window. wscript.exe is a GUI host that
# starts it with no window at all; it waits for the watcher, so the task shows as running.
$launcher = Join-Path $home_ 'clawd-spotify-watch.vbs'
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}" -OutFile "{1}"' -f $script, $StatusFile
$vbs = 'CreateObject("WScript.Shell").Run "{0}", 0, True' -f $command.Replace('"', '""')
Set-Content -Path $launcher -Value $vbs -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //Nologo "{0}"' -f $launcher)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'Writes Spotify play state for the clawd-vibe Claude Code mod.' | Out-Null
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
# Stopping the task leaves the watcher itself running, so end any old copy before starting a new one.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -like '*clawd-spotify-watch.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-ScheduledTask -TaskName $task
Write-Output "Installed '$task': starts at logon, writing $StatusFile"
