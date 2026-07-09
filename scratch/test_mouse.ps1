$Signature = @"
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
"@

$type = Add-Type -MemberDefinition $Signature -Name Win32Mouse -Namespace Win32 -PassThru
# MOUSEEVENTF_MOVE = 0x0001
# MOUSEEVENTF_ABSOLUTE = 0x8000
$type::mouse_event(0x8001, 32768, 32768, 0, [IntPtr]::Zero)
write-output "Test executed."
