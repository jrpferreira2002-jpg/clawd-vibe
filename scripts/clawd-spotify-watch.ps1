# Writes Spotify's play state to a JSON file once a second, for the clawd-vibe Claude Code mod.
# Spotify's desktop window title is "Artist - Track" while playing and "Spotify ..." when paused.
param(
    # Where to write the status. Must match the mod's "Spotify status file" option.
    [string]$OutFile = (Join-Path $PSScriptRoot '.clawd-spotify.json')
)

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$tmp = "$OutFile.tmp"
Write-Host "Watching Spotify -> $OutFile (Ctrl+C to stop)"
while ($true) {
    $title = Get-Process -Name Spotify -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle } |
        Select-Object -First 1 -ExpandProperty MainWindowTitle
    $isPlaying = [bool]$title -and $title -notmatch '^Spotify( (Free|Premium))?$'
    $status = @{
        isPlaying = $isPlaying
        track     = $(if ($isPlaying) { $title } else { '' })
        ts        = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($tmp, $status)
    Move-Item -Force $tmp $OutFile
    Start-Sleep -Seconds 1
}
