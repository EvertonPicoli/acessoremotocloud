$Signature = @"
[DllImport("user32.dll", SetLastError = true)]
public static extern bool SetCursorPos(int X, int Y);
"@

$type = Add-Type -MemberDefinition $Signature -Name Win32MouseTest -Namespace Win32 -PassThru
$res = $type::SetCursorPos(100, 100)
$err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
write-output "SetCursorPos Result: $res, LastError: $err"
