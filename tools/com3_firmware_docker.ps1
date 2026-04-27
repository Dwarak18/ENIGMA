# ENIGMA - COM3 Firmware Docker Watcher (PowerShell)
#
# Watches for an ESP32 USB-serial device on COM3 and uses Docker Compose to
# start or stop the firmware service automatically.
#
# When COM3 appears    -> POST { device_id, online: true,  com_port } and start `firmware`
# When COM3 disappears -> POST { device_id, online: false, com_port } and stop `firmware`
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File tools\com3_firmware_docker.ps1
#
# OVERRIDES:
#   BACKEND_URL       http://localhost
#   DEVICE_ID         esp32-001
#   TARGET_COM_PORT   COM3
#   FIRMWARE_SERVICE  firmware
#   COMPOSE_FILE      docker-compose.yml (absolute path or repo-relative path)

param()

# ---- Configuration -------------------------------------------------------
$BackendUrl   = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { 'http://localhost' }
$DefaultDevice = if ($env:DEVICE_ID) { $env:DEVICE_ID } else { 'esp32-001' }
$TargetPort    = if ($env:TARGET_COM_PORT) { $env:TARGET_COM_PORT.ToUpper() } else { 'COM3' }
$FirmwareService = if ($env:FIRMWARE_SERVICE) { $env:FIRMWARE_SERVICE } else { 'firmware' }

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ComposeFile = if ($env:COMPOSE_FILE) {
    $env:COMPOSE_FILE
} else {
    Join-Path $RepoRoot 'docker-compose.yml'
}

if (-not [System.IO.Path]::IsPathRooted($ComposeFile)) {
    $ComposeFile = Join-Path $RepoRoot $ComposeFile
}

$ApiEndpoint = "$BackendUrl/api/v1/system/device-status"
$HealthEndpoint = "$BackendUrl/health"

# USB-serial chip descriptions that indicate an ESP32 dev board.
$Esp32Keywords = @('CH340', 'CH341', 'CP210', 'Silicon Labs', 'FTDI', 'FT232', 'USB Serial', 'ESP32')

# Optional: map COM port -> device_id
# Example: $PortDeviceMap = @{ 'COM3' = 'esp32-001' }
$PortDeviceMap = @{}

# ---- Helpers -------------------------------------------------------------
function Write-Log {
    param([string]$Level, [string]$Msg)
    $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    $color = switch ($Level) {
        'INFO'  { 'Cyan' }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red' }
        default { 'White' }
    }
    Write-Host "$ts [com3_firmware_docker] " -NoNewline
    Write-Host "$Level " -ForegroundColor $color -NoNewline
    Write-Host $Msg
}

function Test-Esp32Device {
    param([string]$Description)
    foreach ($kw in $Esp32Keywords) {
        if ($Description -match [regex]::Escape($kw)) { return $true }
    }
    return $false
}

function Get-ComPortFromText {
    param([string]$Text)
    if ($Text -match '(COM\d+)') { return $Matches[1].ToUpper() }
    return $null
}

function Get-DeviceIdForPort {
    param([string]$ComPort)
    if ($PortDeviceMap.ContainsKey($ComPort)) { return $PortDeviceMap[$ComPort] }
    return $DefaultDevice
}

function Invoke-DockerCompose {
    param([string[]]$Arguments)

    if (-not (Test-Path $ComposeFile)) {
        Write-Log 'ERROR' "Compose file not found: $ComposeFile"
        return $false
    }

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Log 'ERROR' 'Docker CLI not found on PATH'
        return $false
    }

    try {
        Push-Location (Split-Path $ComposeFile -Parent)
        $output = & docker compose -f $ComposeFile @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker Compose exited with code $LASTEXITCODE`n$($output -join [Environment]::NewLine)"
        }
        return $true
    } catch {
        Write-Log 'ERROR' "Docker Compose command failed: $($_.Exception.Message)"
        return $false
    } finally {
        Pop-Location
    }
}

function Start-FirmwareDocker {
    param([string]$DeviceId, [string]$ComPort)

    Write-Log 'INFO' "Starting firmware Docker service for $ComPort ..."
    $null = Invoke-DockerCompose -Arguments @('up', '-d', $FirmwareService)
    Write-Log 'INFO' "Firmware service requested: $FirmwareService (device=$DeviceId, port=$ComPort)"
}

function Stop-FirmwareDocker {
    param([string]$DeviceId, [string]$ComPort)

    Write-Log 'INFO' "Stopping firmware Docker service for $ComPort ..."
    $null = Invoke-DockerCompose -Arguments @('stop', $FirmwareService)
    Write-Log 'INFO' "Firmware service stopped request sent: $FirmwareService (device=$DeviceId, port=$ComPort)"
}

function Send-DeviceStatus {
    param([string]$DeviceId, [bool]$Online, [string]$ComPort)

    $body = @{
        device_id = $DeviceId
        online    = $Online
        com_port  = $ComPort
    } | ConvertTo-Json -Compress

    try {
        $null = Invoke-RestMethod -Uri $ApiEndpoint `
            -Method POST `
            -Body $body `
            -ContentType 'application/json' `
            -TimeoutSec 5 `
            -ErrorAction Stop

        $state = if ($Online) { 'CONNECTED' } else { 'DISCONNECTED' }
        Write-Log 'INFO' "OK  $DeviceId  $state  (port=$ComPort)"

        if ($ComPort -and $ComPort.ToUpper() -eq $TargetPort) {
            if ($Online) {
                Start-FirmwareDocker -DeviceId $DeviceId -ComPort $ComPort
            } else {
                Stop-FirmwareDocker -DeviceId $DeviceId -ComPort $ComPort
            }
        }
    } catch {
        Write-Log 'WARN' "Backend unreachable - $($_.Exception.Message)"
    }
}

function Wait-ForBackend {
    Write-Log 'INFO' "Waiting for backend at $HealthEndpoint ..."
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $HealthEndpoint -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -lt 500) {
                Write-Log 'INFO' "Backend ready (HTTP $($r.StatusCode))"
                return
            }
        } catch {}
        Start-Sleep -Seconds 3
    }
    Write-Log 'WARN' 'Backend not reachable yet - will retry on each event.'
}

function Scan-ConnectedDevices {
    Write-Log 'INFO' 'Scanning for already-connected ESP32 devices...'
    $found = 0
    Get-WmiObject Win32_PnPEntity | Where-Object {
        $_.Name -and (Test-Esp32Device $_.Name)
    } | ForEach-Object {
        $com = Get-ComPortFromText $_.Name
        if ($com) {
            $did = Get-DeviceIdForPort $com
            Write-Log 'INFO' "  Found: $($_.Name)  ->  $com  ->  device_id=$did"
            Send-DeviceStatus $did $true $com
            $found++
        }
    }
    if ($found -eq 0) { Write-Log 'INFO' '  No ESP32 devices currently connected.' }
}

function Refresh-KnownPorts {
    $current = @{}
    Get-WmiObject Win32_PnPEntity | Where-Object {
        $_.Name -and (Test-Esp32Device $_.Name)
    } | ForEach-Object {
        $com = Get-ComPortFromText $_.Name
        if ($com) { $current[$com] = Get-DeviceIdForPort $com }
    }
    return $current
}

# ---- Main ----------------------------------------------------------------
Write-Host ''
Write-Host '=====================================================================' -ForegroundColor Green
Write-Host '        ENIGMA - COM3 Firmware Docker Watcher                       ' -ForegroundColor Green
Write-Host '=====================================================================' -ForegroundColor Green
Write-Host ''
Write-Log 'INFO' "Backend  : $BackendUrl"
Write-Log 'INFO' "Device   : $DefaultDevice (default)"
Write-Log 'INFO' "Target   : $TargetPort  (firmware auto-start port)"
Write-Log 'INFO' "Compose  : $ComposeFile"
Write-Log 'INFO' "Service  : $FirmwareService"
Write-Log 'INFO' "Keywords : $($Esp32Keywords -join ', ')"
Write-Host ''

Wait-ForBackend
Scan-ConnectedDevices

Write-Host ''
Write-Log 'INFO' 'Watching for USB plug/unplug events... (Ctrl+C to exit)'
Write-Host ''

$knownPorts = @{}
$query = 'SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3'
$watcher = New-Object System.Management.ManagementEventWatcher($query)
$watcher.Options.Timeout = [System.TimeSpan]::FromSeconds(5)

try {
    while ($true) {
        try {
            $null = $watcher.WaitForNextEvent()
        } catch [System.Management.ManagementException] {
            # Timeout is normal - continue polling
        }

        $currentPorts = Refresh-KnownPorts

        foreach ($port in $currentPorts.Keys) {
            if (-not $knownPorts.ContainsKey($port)) {
                $did = $currentPorts[$port]
                Write-Log 'INFO' "USB PLUG   -> $port  (device=$did)"
                Send-DeviceStatus $did $true $port
            }
        }

        foreach ($port in $knownPorts.Keys) {
            if (-not $currentPorts.ContainsKey($port)) {
                $did = $knownPorts[$port]
                Write-Log 'INFO' "USB UNPLUG -> $port  (device=$did)"
                Send-DeviceStatus $did $false $port
            }
        }

        $knownPorts = $currentPorts
    }
} finally {
    $watcher.Dispose()
    Write-Log 'INFO' 'Monitor stopped.'
}
