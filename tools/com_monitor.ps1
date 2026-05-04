# ENIGMA - ESP32 COM Port Monitor (PowerShell)
#
# Watches for ESP32 USB-serial devices (CH340, CP210x, FTDI) being plugged
# or unplugged using WMI real-time events (no polling, no external packages).
#
# When a device appears    -> POST { device_id, online: true,  com_port }
# When a device disappears -> POST { device_id, online: false, com_port }
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File tools\com_monitor.ps1
#
# CUSTOM DEVICE ID OR BACKEND URL:
#   $env:DEVICE_ID   = "esp32-001"
#   $env:BACKEND_URL = "http://localhost"
#   powershell -ExecutionPolicy Bypass -File tools\com_monitor.ps1

param()

# ---- Configuration -------------------------------------------------------
$BackendUrl    = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "http://localhost" }
$DefaultDevice = if ($env:DEVICE_ID)   { $env:DEVICE_ID }   else { "esp32-001" }
$ApiEndpoint   = "$BackendUrl/api/v1/system/device-status"

# The specific COM port to watch for the ENIGMA ESP32 device.
$TargetPort    = if ($env:TARGET_COM_PORT) { $env:TARGET_COM_PORT.ToUpper() } else { "COM3" }
$AutoLaunchSimulator = if ($env:AUTO_LAUNCH_SIMULATOR) { $env:AUTO_LAUNCH_SIMULATOR.ToLower() -eq "true" } else { $false }

# Path to the firmware Python simulator – resolved relative to this script.
$FirmwareScript = if ($env:FIRMWARE_SCRIPT) {
    $env:FIRMWARE_SCRIPT
} else {
    Join-Path (Split-Path $PSScriptRoot -Parent) "firmware\simulate.py"
}
$SimulatorBackendUrl = if ($env:SIMULATOR_BACKEND_URL) { $env:SIMULATOR_BACKEND_URL } else { "http://localhost:3000" }

# USB-serial chip descriptions that indicate an ESP32 dev board
$Esp32Keywords = @("CH340","CH341","CP210","Silicon Labs","FTDI","FT232","USB Serial","ESP32")

# Optional: map COM port -> device_id
# Example: $PortDeviceMap = @{ "COM5" = "esp32-001"; "COM6" = "esp32-002" }
$PortDeviceMap = @{}

# ---- Firmware simulator management --------------------------------------
$script:SimProcess = $null

function Start-FirmwareSimulator {
    param([string]$DeviceId, [string]$ComPort)
    if ($script:SimProcess -and -not $script:SimProcess.HasExited) {
        Write-Log "INFO" "Firmware simulator already running (PID=$($script:SimProcess.Id))"
        return
    }
    if (-not (Test-Path $FirmwareScript)) {
        Write-Log "WARN" "Firmware simulator not found: $FirmwareScript"
        return
    }
    $env:BACKEND_URL  = $SimulatorBackendUrl
    $env:DEVICE_ID    = $DeviceId
    $startInfo                       = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName              = "python"
    $startInfo.Arguments             = "`"$FirmwareScript`""
    $startInfo.UseShellExecute       = $false
    $startInfo.RedirectStandardOutput = $false   # let simulator print to console
    try {
        $script:SimProcess = [System.Diagnostics.Process]::Start($startInfo)
        Write-Log "INFO" "Firmware simulator started  PID=$($script:SimProcess.Id)  device=$DeviceId  port=$ComPort"
    } catch {
        Write-Log "ERROR" "Failed to launch firmware simulator: $($_.Exception.Message)"
    }
}

function Stop-FirmwareSimulator {
    param([string]$DeviceId)
    if ($null -eq $script:SimProcess -or $script:SimProcess.HasExited) {
        Write-Log "INFO" "No running firmware simulator to stop."
        return
    }
    $pid = $script:SimProcess.Id
    Write-Log "INFO" "Stopping firmware simulator  PID=$pid  device=$DeviceId"
    try { $script:SimProcess.Kill() } catch {}
    $script:SimProcess.WaitForExit(5000) | Out-Null
    $script:SimProcess = $null
    Write-Log "INFO" "Firmware simulator stopped  PID=$pid"
}

# ---- Helpers -------------------------------------------------------------
function Write-Log {
    param([string]$Level, [string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
    $color = switch ($Level) {
        "INFO"  { "Cyan"   }
        "WARN"  { "Yellow" }
        "ERROR" { "Red"    }
        default { "White"  }
    }
    Write-Host "$ts [com_monitor] " -NoNewline
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
                    -ContentType "application/json" `
                    -TimeoutSec 5 `
                    -ErrorAction Stop
        $state = if ($Online) { "CONNECTED" } else { "DISCONNECTED" }
        Write-Log "INFO" "OK  $DeviceId  $state  (port=$ComPort)"
        # Optional simulator autostart is disabled by default. Real hardware
        # testing should observe the physical COM port only.
        if ($AutoLaunchSimulator -and $ComPort -and $ComPort.ToUpper() -eq $TargetPort) {
            if ($Online) {
                Start-FirmwareSimulator -DeviceId $DeviceId -ComPort $ComPort
            } else {
                Stop-FirmwareSimulator -DeviceId $DeviceId
            }
        }
    }
    catch {
        Write-Log "WARN" "Backend unreachable - $($_.Exception.Message)"
    }
}

function Wait-ForBackend {
    Write-Log "INFO" "Waiting for backend at $BackendUrl/health ..."
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "$BackendUrl/health" -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -lt 500) {
                Write-Log "INFO" "Backend ready (HTTP $($r.StatusCode))"
                return
            }
        }
        catch {}
        Start-Sleep -Seconds 3
    }
    Write-Log "WARN" "Backend not reachable yet - will retry on each event."
}

function Scan-ConnectedDevices {
    Write-Log "INFO" "Scanning for already-connected ESP32 devices..."
    $found = 0
    Get-WmiObject Win32_PnPEntity | Where-Object {
        $_.Name -and (Test-Esp32Device $_.Name)
    } | ForEach-Object {
        $com = Get-ComPortFromText $_.Name
        if ($com) {
            $did = Get-DeviceIdForPort $com
            Write-Log "INFO" "  Found: $($_.Name)  ->  $com  ->  device_id=$did"
            Send-DeviceStatus $did $true $com
            $found++
        }
    }
    if ($found -eq 0) { Write-Log "INFO" "  No ESP32 devices currently connected." }
}

# ---- Main ----------------------------------------------------------------
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "        ENIGMA - ESP32 COM Port Monitor (PowerShell)                 " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""
Write-Log "INFO" "Backend  : $BackendUrl"
Write-Log "INFO" "Device   : $DefaultDevice (default)"
Write-Log "INFO" "Target   : $TargetPort"
Write-Log "INFO" "Auto sim : $AutoLaunchSimulator"
Write-Log "INFO" "Keywords : $($Esp32Keywords -join ', ')"
Write-Host ""

Wait-ForBackend
Scan-ConnectedDevices

Write-Host ""
Write-Log "INFO" "Watching for USB plug/unplug events... (Ctrl+C to exit)"
Write-Host ""

# ---- WMI real-time event loop --------------------------------------------
# Win32_DeviceChangeEvent fires on any hardware change; we diff COM ports.

$knownPorts = @{}

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

$query   = "SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3"
$watcher = New-Object System.Management.ManagementEventWatcher($query)
$watcher.Options.Timeout = [System.TimeSpan]::FromSeconds(5)

try {
    while ($true) {
        try {
            $null = $watcher.WaitForNextEvent()
        }
        catch [System.Management.ManagementException] {
            # Timeout is normal - continue polling
        }

        $currentPorts = Refresh-KnownPorts

        # Newly appeared ports
        foreach ($port in $currentPorts.Keys) {
            if (-not $knownPorts.ContainsKey($port)) {
                $did = $currentPorts[$port]
                Write-Log "INFO" "USB PLUG   -> $port  (device=$did)"
                Send-DeviceStatus $did $true $port
            }
        }

        # Disappeared ports
        foreach ($port in $knownPorts.Keys) {
            if (-not $currentPorts.ContainsKey($port)) {
                $did = $knownPorts[$port]
                Write-Log "INFO" "USB UNPLUG -> $port  (device=$did)"
                Send-DeviceStatus $did $false $port
            }
        }

        $knownPorts = $currentPorts
    }
}
finally {
    $watcher.Dispose()
    Write-Log "INFO" "Monitor stopped."
}
