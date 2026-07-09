$Source = @"
using System;
using System.Runtime.InteropServices;

public class Win32Input
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT
    {
        [FieldOffset(0)]
        public uint type;
        [FieldOffset(8)] // 8-byte alignment on 64-bit
        public MOUSEINPUT mi;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public static bool MoveMouse(int x, int y)
    {
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = 0; // INPUT_MOUSE
        inputs[0].mi.dx = x;
        inputs[0].mi.dy = y;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = 0x0001 | 0x8000 | 0x4000; // MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;

        uint result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        return result > 0;
    }
}
"@

Add-Type -TypeDefinition $Source
$res = [Win32Input]::MoveMouse(32768, 32768)
write-output "SendInput Result: $res"
