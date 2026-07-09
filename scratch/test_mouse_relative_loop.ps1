$Signature = @"
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
"@

$type = Add-Type -MemberDefinition $Signature -Name Win32MouseRelLoop -Namespace Win32 -PassThru
# MOUSEEVENTF_MOVE = 0x0001

for ($i = 0; $i -lt 5; $i++) {
    $type::mouse_event(0x0001, 100, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    $type::mouse_event(0x0001, 0, 100, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    $type::mouse_event(0x0001, -100, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    $type::mouse_event(0x0001, 0, -100, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 200
}
write-output "Relative mouse loop completed."
