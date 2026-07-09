$Source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Foreground
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

Add-Type -TypeDefinition $Source

# Wait 3 seconds so the user can switch to Chrome/viewer if they want
write-output "Waiting 3 seconds... Please focus the window you are using."
Start-Sleep -Seconds 3

$hwnd = [Win32Foreground]::GetForegroundWindow()
$pid = 0
[Win32Foreground]::GetWindowThreadProcessId($hwnd, [ref]$pid)
$title = New-Object System.Text.StringBuilder(256)
[Win32Foreground]::GetWindowText($hwnd, $title, 256)

$process = Get-Process -Id $pid
$processName = $process.ProcessName
$sessionId = $process.SessionId

# Check if process is elevated
$token = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($token)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

write-output "Foreground Window Title: $($title.ToString())"
write-output "Process Name: $processName, PID: $pid, SessionId: $sessionId"
write-output "Is Current PowerShell Admin: $isAdmin"
