$processes = Get-Process | Where-Object { $_.ProcessName -like "*InputSimulator*" }
if (-not $processes) {
    write-output "No InputSimulator processes are running."
    exit
}

foreach ($p in $processes) {
    $username = ""
    try {
        $username = (Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($p.Id)").GetOwner().User
    } catch {
        $username = "Unknown"
    }

    write-output "Process: $($p.ProcessName) (PID: $($p.Id))"
    write-output "Session ID: $($p.SessionId)"
    write-output "User: $username"
}
