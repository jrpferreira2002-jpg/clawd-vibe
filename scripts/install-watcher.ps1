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

$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -OutFile "{1}"' -f $script, $StatusFile
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'Writes Spotify play state for the clawd-vibe Claude Code mod.' | Out-Null
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $task
Write-Output "Installed '$task': starts at logon, writing $StatusFile"
