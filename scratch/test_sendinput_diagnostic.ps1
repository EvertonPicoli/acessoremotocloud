$Source = @"
using System;
using System.Runtime.InteropServices;

public class Win32InputDiag
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
        [FieldOffset(8)]
        public MOUSEINPUT mi;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public static void Test()
    {
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = 0; // INPUT_MOUSE
        inputs[0].mi.dx = 32768;
        inputs[0].mi.dy = 32768;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = 0x0001 | 0x8000 | 0x4000; // MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;

        int size = Marshal.SizeOf(typeof(INPUT));
        uint result = SendInput(1, inputs, size);
        int error = Marshal.GetLastWin32Error();

        Console.WriteLine("SendInput Result: " + result + ", Size: " + size + ", LastError: " + error);
    }
}
"@

Add-Type -TypeDefinition $Source
[Win32InputDiag]::Test()
