$Signature = @"
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
"@

$type = Add-Type -MemberDefinition $Signature -Name Win32MouseRel -Namespace Win32 -PassThru
# MOUSEEVENTF_MOVE = 0x0001
$type::mouse_event(0x0001, 100, 100, 0, [IntPtr]::Zero)
write-output "Relative mouse_event executed."
