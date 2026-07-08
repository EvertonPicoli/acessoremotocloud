using System;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

class InputSimulator
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct CURSORINFO
    {
        public Int32 cbSize;
        public Int32 flags;
        public IntPtr hCursor;
        public POINTAPI ptScreenPos;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct POINTAPI
    {
        public Int32 x;
        public Int32 y;
    }

    [DllImport("user32.dll")]
    static extern bool GetCursorInfo(out CURSORINFO pci);

    [DllImport("user32.dll")]
    static extern bool DrawIcon(IntPtr hDC, int x, int y, IntPtr hIcon);

    const Int32 CURSOR_SHOWING = 0x00000001;

    const uint INPUT_MOUSE = 0;
    const uint INPUT_KEYBOARD = 1;

    const uint MOUSEEVENTF_MOVE = 0x0001;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

    const uint KEYEVENTF_KEYDOWN = 0x0000;
    const uint KEYEVENTF_KEYUP = 0x0002;

    static bool isCapturing = false;
    static System.Threading.Thread captureThread;

    static void StartCapture()
    {
        if (isCapturing) return;
        isCapturing = true;
        captureThread = new System.Threading.Thread(CaptureLoop);
        captureThread.IsBackground = true;
        captureThread.Start();
    }

    static void StopCapture()
    {
        isCapturing = false;
    }

    static void CaptureLoop()
    {
        int width = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
        int height = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;
        
        // Redimensionar para melhor desempenho na rede (limitar largura máxima a 1920px)
        double scale = 1.0;
        if (width > 1920) {
            scale = 1920.0 / width;
        }
        int destWidth = (int)(width * scale);
        int destHeight = (int)(height * scale);

        ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
        Encoder myEncoder = Encoder.Quality;
        EncoderParameters myEncoderParameters = new EncoderParameters(1);
        EncoderParameter myEncoderParameter = new EncoderParameter(myEncoder, 85L); // 85% de qualidade para alta nitidez e textos perfeitamente legíveis
        myEncoderParameters.Param[0] = myEncoderParameter;

        while (isCapturing)
        {
            try
            {
                using (Bitmap bmp = new Bitmap(width, height))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        g.CopyFromScreen(0, 0, 0, 0, bmp.Size);
                        
                        // Desenhar cursor na captura de tela
                        CURSORINFO pci;
                        pci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
                        if (GetCursorInfo(out pci))
                        {
                            if (pci.flags == CURSOR_SHOWING)
                            {
                                DrawIcon(g.GetHdc(), pci.ptScreenPos.x, pci.ptScreenPos.y, pci.hCursor);
                                g.ReleaseHdc();
                            }
                        }
                    }

                    using (Bitmap scaledBmp = new Bitmap(destWidth, destHeight))
                    {
                        using (Graphics gScaled = Graphics.FromImage(scaledBmp))
                        {
                            gScaled.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                            gScaled.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                            gScaled.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                            gScaled.DrawImage(bmp, 0, 0, destWidth, destHeight);
                        }

                        using (MemoryStream ms = new MemoryStream())
                        {
                            scaledBmp.Save(ms, jpgEncoder, myEncoderParameters);
                            byte[] bytes = ms.ToArray();
                            string base64 = Convert.ToBase64String(bytes);
                            Console.WriteLine("FRAME:" + base64);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error capturing screen: " + ex.Message);
            }
            System.Threading.Thread.Sleep(100); // ~10 FPS
        }
    }

    static ImageCodecInfo GetEncoder(ImageFormat format)
    {
        ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
        foreach (ImageCodecInfo codec in codecs)
        {
            if (codec.FormatID == format.Guid)
            {
                return codec;
            }
        }
        return null;
    }

    static void Main()
    {
        Console.WriteLine("InputSimulator Ready");
        string line;
        
        Regex typeRegex = new Regex("\"type\"\\s*:\\s*\"([^\"]+)\"", RegexOptions.Compiled);
        Regex xRegex = new Regex("\"x\"\\s*:\\s*([0-9.]+)", RegexOptions.Compiled);
        Regex yRegex = new Regex("\"y\"\\s*:\\s*([0-9.]+)", RegexOptions.Compiled);
        Regex buttonRegex = new Regex("\"button\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
        Regex vkRegex = new Regex("\"vk\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);

        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                Match typeMatch = typeRegex.Match(line);
                if (!typeMatch.Success) continue;
                string type = typeMatch.Groups[1].Value;

                INPUT[] inputs = new INPUT[1];
                uint result = 0;

                if (type == "start_capture")
                {
                    StartCapture();
                }
                else if (type == "stop_capture")
                {
                    StopCapture();
                }
                else if (type == "mousemove")
                {
                    Match xMatch = xRegex.Match(line);
                    Match yMatch = yRegex.Match(line);
                    if (xMatch.Success && yMatch.Success)
                    {
                        double x = double.Parse(xMatch.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                        double y = double.Parse(yMatch.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);

                        inputs[0].type = INPUT_MOUSE;
                        inputs[0].u.mi.dx = (int)x;
                        inputs[0].u.mi.dy = (int)y;
                        inputs[0].u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
                        
                        result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                        if (result == 0)
                        {
                            Console.Error.WriteLine("Error: SendInput returned 0 for mousemove. Win32 Error: " + Marshal.GetLastWin32Error());
                        }
                    }
                }
                else if (type == "mousedown")
                {
                    Match btnMatch = buttonRegex.Match(line);
                    if (btnMatch.Success)
                    {
                        int button = int.Parse(btnMatch.Groups[1].Value);
                        inputs[0].type = INPUT_MOUSE;
                        if (button == 0) inputs[0].u.mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
                        else if (button == 2) inputs[0].u.mi.dwFlags = MOUSEEVENTF_RIGHTDOWN;
                        else if (button == 1) inputs[0].u.mi.dwFlags = MOUSEEVENTF_MIDDLEDOWN;

                        result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                        if (result == 0)
                        {
                            Console.Error.WriteLine("Error: SendInput returned 0 for mousedown. Win32 Error: " + Marshal.GetLastWin32Error());
                        }
                    }
                }
                else if (type == "mouseup")
                {
                    Match btnMatch = buttonRegex.Match(line);
                    if (btnMatch.Success)
                    {
                        int button = int.Parse(btnMatch.Groups[1].Value);
                        inputs[0].type = INPUT_MOUSE;
                        if (button == 0) inputs[0].u.mi.dwFlags = MOUSEEVENTF_LEFTUP;
                        else if (button == 2) inputs[0].u.mi.dwFlags = MOUSEEVENTF_RIGHTUP;
                        else if (button == 1) inputs[0].u.mi.dwFlags = MOUSEEVENTF_MIDDLEUP;

                        result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                        if (result == 0)
                        {
                            Console.Error.WriteLine("Error: SendInput returned 0 for mouseup. Win32 Error: " + Marshal.GetLastWin32Error());
                        }
                    }
                }
                else if (type == "keydown")
                {
                    Match vkMatch = vkRegex.Match(line);
                    if (vkMatch.Success)
                    {
                        ushort vk = ushort.Parse(vkMatch.Groups[1].Value);
                        inputs[0].type = INPUT_KEYBOARD;
                        inputs[0].u.ki.wVk = vk;
                        inputs[0].u.ki.dwFlags = KEYEVENTF_KEYDOWN;

                        result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                        if (result == 0)
                        {
                            Console.Error.WriteLine("Error: SendInput returned 0 for keydown. Win32 Error: " + Marshal.GetLastWin32Error());
                        }
                    }
                }
                else if (type == "keyup")
                {
                    Match vkMatch = vkRegex.Match(line);
                    if (vkMatch.Success)
                    {
                        ushort vk = ushort.Parse(vkMatch.Groups[1].Value);
                        inputs[0].type = INPUT_KEYBOARD;
                        inputs[0].u.ki.wVk = vk;
                        inputs[0].u.ki.dwFlags = KEYEVENTF_KEYUP;

                        result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                        if (result == 0)
                        {
                            Console.Error.WriteLine("Error: SendInput returned 0 for keyup. Win32 Error: " + Marshal.GetLastWin32Error());
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error simulating input: " + ex.Message);
            }
        }
    }
}
