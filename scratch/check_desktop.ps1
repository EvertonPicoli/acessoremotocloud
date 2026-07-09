$Source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32DesktopDiag
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetProcessWindowStation();

    [DllImport("user32.dll")]
    private static extern IntPtr GetThreadDesktop(int threadId);

    [DllImport("kernel32.dll")]
    private static extern int GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);

    private const int UOI_NAME = 2;

    public static void Check()
    {
        IntPtr hWinSta = GetProcessWindowStation();
        string winStaName = GetObjectName(hWinSta);

        IntPtr hDesk = GetThreadDesktop(GetCurrentThreadId());
        string deskName = GetObjectName(hDesk);

        Console.WriteLine("Window Station: " + winStaName + ", Desktop: " + deskName);
    }

    private static string GetObjectName(IntPtr hObj)
    {
        if (hObj == IntPtr.Zero) return "null";
        StringBuilder sb = new StringBuilder(256);
        int needed = 0;
        if (GetUserObjectInformation(hObj, UOI_NAME, sb, 256, out needed))
        {
            return sb.ToString();
        }
        return "error";
    }
}
"@

Add-Type -TypeDefinition $Source
[Win32DesktopDiag]::Check()
