using System;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;

class InputSimulator
{
    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool BlockInput(bool fBlockIt);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    static extern bool GetCursorInfo(out CURSORINFO pci);

    [DllImport("user32.dll")]
    static extern bool DrawIcon(IntPtr hDC, int x, int y, IntPtr hIcon);

    [DllImport("user32.dll")]
    static extern bool SetCursorPos(int X, int Y);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

    const int STD_INPUT_HANDLE = -10;
    const uint ENABLE_QUICK_EDIT_MODE = 0x0040;
    const uint ENABLE_EXTENDED_FLAGS = 0x0080;

    static void DisableQuickEdit()
    {
        try
        {
            IntPtr conIn = GetStdHandle(STD_INPUT_HANDLE);
            uint mode;
            if (GetConsoleMode(conIn, out mode))
            {
                mode &= ~ENABLE_QUICK_EDIT_MODE;
                mode |= ENABLE_EXTENDED_FLAGS;
                SetConsoleMode(conIn, mode);
            }
        }
        catch {}
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

    const Int32 CURSOR_SHOWING = 0x00000001;

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;

    const uint KEYEVENTF_KEYDOWN = 0x0000;
    const uint KEYEVENTF_KEYUP = 0x0002;

    static bool isCapturing = false;
    static System.Threading.Thread captureThread;
    static StreamWriter tcpWriter = null;

    static void LogToAgent(string message)
    {
        if (tcpWriter != null)
        {
            try
            {
                tcpWriter.WriteLine("LOG:" + message);
                tcpWriter.Flush();
            }
            catch {}
        }
        Console.WriteLine(message);
    }

    static void StartCapture()
    {
        // Se já está capturando, para e reinicia para usar o novo tcpWriter
        if (isCapturing)
        {
            isCapturing = false;
            if (captureThread != null)
            {
                captureThread.Join(500);
            }
        }
        isCapturing = true;
        LogToAgent("[Simulator] StartCapture() chamado, iniciando thread de captura...");
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
        LogToAgent("[Simulator] CaptureLoop() thread iniciada.");
        int width = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
        int height = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;
        
        double scale = 1.0;
        if (width > 1920) {
            scale = 1920.0 / width;
        }
        int destWidth = (int)(width * scale);
        int destHeight = (int)(height * scale);

        ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
        Encoder myEncoder = Encoder.Quality;
        EncoderParameters myEncoderParameters = new EncoderParameters(1);
        EncoderParameter myEncoderParameter = new EncoderParameter(myEncoder, 45L); 
        myEncoderParameters.Param[0] = myEncoderParameter;

        while (isCapturing)
        {
            try
            {
                using (Bitmap bmp = new Bitmap(width, height))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        // Copia a tela usando o offset absoluto do monitor para evitar erros de multimonitor
                        g.CopyFromScreen(
                            System.Windows.Forms.Screen.PrimaryScreen.Bounds.X, 
                            System.Windows.Forms.Screen.PrimaryScreen.Bounds.Y, 
                            0, 0, 
                            bmp.Size
                        );
                        
                        CURSORINFO pci;
                        pci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
                        if (GetCursorInfo(out pci))
                        {
                            if (pci.flags == CURSOR_SHOWING)
                            {
                                // Compensar posição do cursor com a origem real da tela
                                int cursorX = pci.ptScreenPos.x - System.Windows.Forms.Screen.PrimaryScreen.Bounds.X;
                                int cursorY = pci.ptScreenPos.y - System.Windows.Forms.Screen.PrimaryScreen.Bounds.Y;
                                DrawIcon(g.GetHdc(), cursorX, cursorY, pci.hCursor);
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
                            if (tcpWriter != null)
                            {
                                try
                                {
                                    tcpWriter.WriteLine("FRAME:" + base64);
                                    tcpWriter.Flush();
                                    if (new Random().Next(0, 100) == 0)
                                    {
                                        LogToAgent("[Simulator] Loop de captura ativo (enviando frames...)");
                                    }
                                }
                                catch {}
                            }
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
        DisableQuickEdit();
        try { SetProcessDPIAware(); } catch {}
        try
        {
            foreach (var screen in System.Windows.Forms.Screen.AllScreens)
            {
                Console.WriteLine(string.Format("SCREEN_INFO: Device={0} Bounds={1} Primary={2}", screen.DeviceName, screen.Bounds, screen.Primary));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("SCREEN_INFO_ERROR: " + ex.Message);
        }
        Console.WriteLine("InputSimulator Ready");

        // Inicia servidor de Inputs em background na porta 9996
        System.Threading.Thread inputThread = new System.Threading.Thread(InputListenerLoop);
        inputThread.IsBackground = true;
        inputThread.Start();

        // Inicia servidor de Frames no main thread na porta 9995
        FrameListenerLoop();
    }

    static void FrameListenerLoop()
    {
        Regex typeRegex = new Regex("\"type\"\\s*:\\s*\"([^\"]+)\"", RegexOptions.Compiled);
        TcpListener server = null;
        try
        {
            server = new TcpListener(IPAddress.Loopback, 9997);
            server.Start();
            Console.WriteLine("[Simulator] Servidor TCP de FRAMES ativo em 127.0.0.1:9997");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Erro ao iniciar servidor TCP de frames: " + ex.Message);
            return;
        }

        while (true)
        {
            try
            {
                using (TcpClient client = server.AcceptTcpClient())
                {
                    client.NoDelay = true;
                    using (NetworkStream stream = client.GetStream())
                    using (StreamWriter writer = new StreamWriter(stream))
                    {
                        tcpWriter = writer;
                        Console.WriteLine("[Simulator] Agente Node.js conectado no canal TCP de FRAMES");
                        string line;
                        while ((line = ReadLine(stream)) != null)
                        {
                            try
                            {
                                Match typeMatch = typeRegex.Match(line);
                                if (!typeMatch.Success) continue;
                                string type = typeMatch.Groups[1].Value;

                                if (type == "start_capture")
                                {
                                    StartCapture();
                                }
                                else if (type == "stop_capture")
                                {
                                    StopCapture();
                                }
                            }
                            catch {}
                        }
                        tcpWriter = null;
                    }
                }
            }
            catch {}
        }
    }

    static void InputListenerLoop()
    {
        Regex typeRegex = new Regex("\"type\"\\s*:\\s*\"([^\"]+)\"", RegexOptions.Compiled);
        Regex buttonRegex = new Regex("\"button\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
        Regex vkRegex = new Regex("\"vk\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
        Regex xRegex = new Regex("\"x\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
        Regex yRegex = new Regex("\"y\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);

        TcpListener server = null;
        try
        {
            server = new TcpListener(IPAddress.Loopback, 9998);
            server.Start();
            Console.WriteLine("[Simulator] Servidor TCP de INPUTS ativo em 127.0.0.1:9998");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Erro ao iniciar servidor TCP de inputs: " + ex.Message);
            return;
        }

        while (true)
        {
            try
            {
                using (TcpClient client = server.AcceptTcpClient())
                {
                    client.NoDelay = true;
                    using (NetworkStream stream = client.GetStream())
                    {
                        Console.WriteLine("[Simulator] Agente Node.js conectado no canal TCP de INPUTS");
                        string line;
                        while ((line = ReadLine(stream)) != null)
                        {
                            try
                            {
                                Match typeMatch = typeRegex.Match(line);
                                if (!typeMatch.Success) continue;
                                string type = typeMatch.Groups[1].Value;

                                if (type == "mousemove")
                                {
                                    Match xMatch = xRegex.Match(line);
                                    Match yMatch = yRegex.Match(line);
                                    if (xMatch.Success && yMatch.Success)
                                    {
                                        int x = int.Parse(xMatch.Groups[1].Value);
                                        int y = int.Parse(yMatch.Groups[1].Value);
                                        SetCursorPos(x, y);
                                    }
                                }
                                else if (type == "mousedown")
                                {
                                    Match btnMatch = buttonRegex.Match(line);
                                    if (btnMatch.Success)
                                    {
                                        int button = int.Parse(btnMatch.Groups[1].Value);
                                        uint flags = 0;
                                        if (button == 0) flags = MOUSEEVENTF_LEFTDOWN;
                                        else if (button == 2) flags = MOUSEEVENTF_RIGHTDOWN;
                                        else if (button == 1) flags = MOUSEEVENTF_MIDDLEDOWN;

                                        mouse_event(flags, 0, 0, 0, IntPtr.Zero);
                                    }
                                }
                                else if (type == "mouseup")
                                {
                                    Match btnMatch = buttonRegex.Match(line);
                                    if (btnMatch.Success)
                                    {
                                        int button = int.Parse(btnMatch.Groups[1].Value);
                                        uint flags = 0;
                                        if (button == 0) flags = MOUSEEVENTF_LEFTUP;
                                        else if (button == 2) flags = MOUSEEVENTF_RIGHTUP;
                                        else if (button == 1) flags = MOUSEEVENTF_MIDDLEUP;

                                        mouse_event(flags, 0, 0, 0, IntPtr.Zero);
                                    }
                                }
                                else if (type == "keydown")
                                {
                                    Match vkMatch = vkRegex.Match(line);
                                    if (vkMatch.Success)
                                    {
                                        ushort vk = ushort.Parse(vkMatch.Groups[1].Value);
                                        byte scanCode = (byte)MapVirtualKey(vk, 0);
                                        keybd_event((byte)vk, scanCode, KEYEVENTF_KEYDOWN, IntPtr.Zero);
                                    }
                                }
                                else if (type == "keyup")
                                {
                                    Match vkMatch = vkRegex.Match(line);
                                    if (vkMatch.Success)
                                    {
                                        ushort vk = ushort.Parse(vkMatch.Groups[1].Value);
                                        byte scanCode = (byte)MapVirtualKey(vk, 0);
                                        keybd_event((byte)vk, scanCode, KEYEVENTF_KEYUP, IntPtr.Zero);
                                    }
                                }
                            }
                            catch {}
                        }
                    }
                }
            }
            catch {}
        }
    }

    static string ReadLine(NetworkStream stream)
    {
        MemoryStream ms = new MemoryStream();
        while (true)
        {
            int b = stream.ReadByte();
            if (b == -1)
            {
                if (ms.Length == 0) return null;
                break;
            }
            if (b == '\n') break;
            if (b != '\r') ms.WriteByte((byte)b);
        }
        byte[] bytes = ms.ToArray();
        return System.Text.Encoding.UTF8.GetString(bytes);
    }
}
