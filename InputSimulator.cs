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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern bool ClipCursor(IntPtr rect);

    [DllImport("user32.dll")]
    private static extern bool BlockInput(bool fBlockIt);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

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
        if (isCapturing) return;
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
                             if (tcpWriter != null)
                             {
                                 try
                                 {
                                     tcpWriter.WriteLine("FRAME:" + base64);
                                     tcpWriter.Flush();
                                     // Log periódico (aproximadamente a cada 100 frames) para debug sem flood
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

        Regex typeRegex = new Regex("\"type\"\\s*:\\s*\"([^\"]+)\"", RegexOptions.Compiled);
        Regex xRegex = new Regex("\"x\"\\s*:\\s*([0-9.]+)", RegexOptions.Compiled);
        Regex yRegex = new Regex("\"y\"\\s*:\\s*([0-9.]+)", RegexOptions.Compiled);
        Regex buttonRegex = new Regex("\"button\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
        Regex vkRegex = new Regex("\"vk\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);

        // Inicia um servidor TCP local na porta 9990 para receber os inputs
        TcpListener server = null;
        try
        {
            server = new TcpListener(IPAddress.Loopback, 9990);
            server.Start();
            Console.WriteLine("[Simulator] Servidor TCP ativo em 127.0.0.1:9990");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Erro ao iniciar servidor TCP do Simulator: " + ex.Message);
            return;
        }

        // Loop principal aceitando conexões (geralmente uma única conexão persistente do Node.js)
        while (true)
        {
            try
            {
                using (TcpClient client = server.AcceptTcpClient())
                using (NetworkStream stream = client.GetStream())
                using (StreamReader reader = new StreamReader(stream))
                using (StreamWriter writer = new StreamWriter(stream))
                {
                    tcpWriter = writer;
                    Console.WriteLine("[Simulator] Agente Node.js conectado no canal TCP");
                    string line;
                    while ((line = reader.ReadLine()) != null)
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
                            else if (type == "mousemove")
                            {
                                Match xMatch = xRegex.Match(line);
                                Match yMatch = yRegex.Match(line);
                                if (xMatch.Success && yMatch.Success)
                                {
                                    double x = double.Parse(xMatch.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                                    double y = double.Parse(yMatch.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);

                                    int screenWidth = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
                                    int screenHeight = System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;
                                    int pixelX = (int)(x * screenWidth / 65535.0);
                                    int pixelY = (int)(y * screenHeight / 65535.0);
                                    BlockInput(false);
                                    ClipCursor(IntPtr.Zero);
                                    bool moved = SetCursorPos(pixelX, pixelY);
                                    int err = Marshal.GetLastWin32Error();
                                    LogToAgent(string.Format("[Simulator] MouseMove to ({0}, {1}) -> ({2}, {3}) moved={4} error={5} executed", x, y, pixelX, pixelY, moved, err));
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
                                    LogToAgent(string.Format("[Simulator] MouseDown button={0} executed", button));
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
                                    LogToAgent(string.Format("[Simulator] MouseUp button={0} executed", button));
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
                                    LogToAgent(string.Format("[Simulator] KeyDown vk={0} scan={1} executed", vk, scanCode));
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
                                    LogToAgent(string.Format("[Simulator] KeyUp vk={0} scan={1} executed", vk, scanCode));
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.Error.WriteLine("Error simulating input: " + ex.Message);
                        }
                    }
                    tcpWriter = null;
                }
            }
            catch (Exception)
            {
                // Conexão do cliente fechou ou caiu, aguarda a próxima
            }
        }
    }
}
