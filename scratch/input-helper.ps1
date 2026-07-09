Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition @"
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
"@ -Name Win32API -Namespace Win32

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_MIDDLEDOWN = 0x0020
$MOUSEEVENTF_MIDDLEUP = 0x0040

$KEYEVENTF_KEYDOWN = 0x0000
$KEYEVENTF_KEYUP = 0x0002

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($line = [Console]::ReadLine()) {
    if ($null -eq $line) { break }
    try {
        if ($line.StartsWith("MOVE ")) {
            $parts = $line.Substring(5).Split(" ")
            $x = [int]$parts[0]
            $y = [int]$parts[1]
            [Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        }
        elseif ($line.StartsWith("CLICK_DOWN ")) {
            $btn = [int]$line.Substring(11)
            $flag = $MOUSEEVENTF_LEFTDOWN
            if ($btn -eq 2) { $flag = $MOUSEEVENTF_RIGHTDOWN }
            elseif ($btn -eq 1) { $flag = $MOUSEEVENTF_MIDDLEDOWN }
            [Win32.Win32API]::mouse_event($flag, 0, 0, 0, [IntPtr]::Zero)
        }
        elseif ($line.StartsWith("CLICK_UP ")) {
            $btn = [int]$line.Substring(9)
            $flag = $MOUSEEVENTF_LEFTUP
            if ($btn -eq 2) { $flag = $MOUSEEVENTF_RIGHTUP }
            elseif ($btn -eq 1) { $flag = $MOUSEEVENTF_MIDDLEUP }
            [Win32.Win32API]::mouse_event($flag, 0, 0, 0, [IntPtr]::Zero)
        }
        elseif ($line.StartsWith("KEY_DOWN ")) {
            $vk = [byte][int]$line.Substring(9)
            [Win32.Win32API]::keybd_event($vk, 0, $KEYEVENTF_KEYDOWN, [IntPtr]::Zero)
        }
        elseif ($line.StartsWith("KEY_UP ")) {
            $vk = [byte][int]$line.Substring(7)
            [Win32.Win32API]::keybd_event($vk, 0, $KEYEVENTF_KEYUP, [IntPtr]::Zero)
        }
    } catch {
        # Ignorar erros
    }
}
