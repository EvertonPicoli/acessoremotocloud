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

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);

    static void LogToFile(string message)
    {
        try
        {
            string path = @"c:\Users\Innova\Documents\GitHub\acessoremotocloud\debug_simulator.log";
            System.IO.File.AppendAllText(path, string.Format("[{0}] {1}\r\n", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"), message));
        }
        catch {}
    }

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

    static volatile bool isCapturing = false;
    static System.Threading.Thread captureThread;
    static NetworkStream tcpStream = null;
    static volatile int selectedScreenIndex = 0;

    static void LogToAgent(string message)
    {
        if (tcpStream != null)
        {
            try
            {
                byte[] logBytes = System.Text.Encoding.UTF8.GetBytes(message);
                byte[] header = new byte[16];
                
                // Magic: 'L', 'O', 'G', '_'
                header[0] = 0x4C;
                header[1] = 0x4F;
                header[2] = 0x47;
                header[3] = 0x5F;
                
                // Param1 = 0, Param2 = 0
                // PayloadSize (Little Endian)
                header[12] = (byte)(logBytes.Length & 0xFF);
                header[13] = (byte)((logBytes.Length >> 8) & 0xFF);
                header[14] = (byte)((logBytes.Length >> 16) & 0xFF);
                header[15] = (byte)((logBytes.Length >> 24) & 0xFF);

                lock (tcpStream)
                {
                    tcpStream.Write(header, 0, 16);
                    tcpStream.Write(logBytes, 0, logBytes.Length);
                    tcpStream.Flush();
                }
            }
            catch {}
        }
        Console.WriteLine(message);
    }

    static void StartCapture()
    {
        if (isCapturing) return; // Se já está rodando, não reinicia (evita concorrência e vazamento de thread)
        
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
        LogToFile("CaptureLoop thread iniciada.");
        int lastLoggedIndex = -1;
        
        byte[] rgbBuffer = null;
        byte[] prevRgbBuffer = null;
        bool firstFrame = true;
        DateTime lastFrameTime = DateTime.MinValue;
        
        while (isCapturing)
        {
            try
            {
                var screens = System.Windows.Forms.Screen.AllScreens;
                System.Windows.Forms.Screen screen = System.Windows.Forms.Screen.PrimaryScreen;
                if (selectedScreenIndex >= 0 && selectedScreenIndex < screens.Length)
                {
                    screen = screens[selectedScreenIndex];
                }

                if (selectedScreenIndex != lastLoggedIndex)
                {
                    LogToFile(string.Format("CaptureLoop monitor mudou para index: {0}. Total: {1}. Bounds: {2}", selectedScreenIndex, screens.Length, screen.Bounds));
                    lastLoggedIndex = selectedScreenIndex;
                }

                int width = screen.Bounds.Width;
                int height = screen.Bounds.Height;
                int screenX = screen.Bounds.X;
                int screenY = screen.Bounds.Y;
                
                double scale = 1.0;
                if (width > 1280) {
                    scale = 1280.0 / width;
                }
                int destWidth = (int)(width * scale);
                int destHeight = (int)(height * scale);
                
                // Força dimensões a serem pares para evitar crash na codificação YUV do WebRTC
                if (destWidth % 2 != 0) destWidth--;
                if (destHeight % 2 != 0) destHeight--;

                using (Bitmap bmp = new Bitmap(width, height))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        // Copia a tela usando o offset absoluto do monitor selecionado
                        g.CopyFromScreen(
                            screenX, 
                            screenY, 
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
                                int cursorX = pci.ptScreenPos.x - screenX;
                                int cursorY = pci.ptScreenPos.y - screenY;
                                if (cursorX >= 0 && cursorX < width && cursorY >= 0 && cursorY < height)
                                {
                                    DrawIcon(g.GetHdc(), cursorX, cursorY, pci.hCursor);
                                    g.ReleaseHdc();
                                }
                            }
                        }
                    }

                    using (Bitmap scaledBmp = new Bitmap(destWidth, destHeight))
                    {
                        using (Graphics gScaled = Graphics.FromImage(scaledBmp))
                        {
                            gScaled.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                            gScaled.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
                            gScaled.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.None;
                            gScaled.DrawImage(bmp, 0, 0, destWidth, destHeight);
                        }

                        // Lock bits do bitmap scaledBmp para acessar memória direta de pixels
                        Rectangle rect = new Rectangle(0, 0, destWidth, destHeight);
                        System.Drawing.Imaging.BitmapData bmpData = scaledBmp.LockBits(
                            rect, 
                            System.Drawing.Imaging.ImageLockMode.ReadOnly,
                            System.Drawing.Imaging.PixelFormat.Format32bppArgb
                        );

                        IntPtr ptr = bmpData.Scan0;
                        int bytesCount = Math.Abs(bmpData.Stride) * destHeight;
                        
                        if (rgbBuffer == null || rgbBuffer.Length != bytesCount)
                        {
                            rgbBuffer = new byte[bytesCount];
                            prevRgbBuffer = new byte[bytesCount];
                            firstFrame = true;
                        }

                        // Copia memória direta do Bitmap para o array
                        System.Runtime.InteropServices.Marshal.Copy(ptr, rgbBuffer, 0, bytesCount);
                        scaledBmp.UnlockBits(bmpData);

                        // Converte formato da memória do Bitmap GDI (BGRA) para RGBA exigido pelo WebRTC
                        // E detecta se há alterações em relação ao buffer anterior
                        bool hasChanges = firstFrame || (DateTime.Now - lastFrameTime).TotalMilliseconds >= 1000;
                        
                        for (int i = 0; i < bytesCount; i += 4)
                        {
                            byte blue = rgbBuffer[i];
                            byte green = rgbBuffer[i + 1];
                            byte red = rgbBuffer[i + 2];
                            byte alpha = 255;

                            // Atualiza para RGBA
                            rgbBuffer[i] = red;
                            rgbBuffer[i + 2] = blue;
                            rgbBuffer[i + 3] = alpha;

                            if (!hasChanges)
                            {
                                if (red != prevRgbBuffer[i] ||
                                    green != prevRgbBuffer[i + 1] ||
                                    blue != prevRgbBuffer[i + 2])
                                {
                                    hasChanges = true;
                                }
                            }
                        }

                        if (hasChanges)
                        {
                            Buffer.BlockCopy(rgbBuffer, 0, prevRgbBuffer, 0, bytesCount);
                            firstFrame = false;
                            lastFrameTime = DateTime.Now;

                            if (tcpStream != null)
                            {
                                try
                                {
                                    byte[] header = new byte[16];
                                    
                                    // Magic: 'F', 'R', 'M', 'E'
                                    header[0] = 0x46;
                                    header[1] = 0x52;
                                    header[2] = 0x4D;
                                    header[3] = 0x45;
                                    
                                    // Width (Little Endian)
                                    header[4] = (byte)(destWidth & 0xFF);
                                    header[5] = (byte)((destWidth >> 8) & 0xFF);
                                    header[6] = (byte)((destWidth >> 16) & 0xFF);
                                    header[7] = (byte)((destWidth >> 24) & 0xFF);
                                    
                                    // Height (Little Endian)
                                    header[8] = (byte)(destHeight & 0xFF);
                                    header[9] = (byte)((destHeight >> 8) & 0xFF);
                                    header[10] = (byte)((destHeight >> 16) & 0xFF);
                                    header[11] = (byte)((destHeight >> 24) & 0xFF);
                                    
                                    // PayloadSize (Little Endian)
                                    header[12] = (byte)(bytesCount & 0xFF);
                                    header[13] = (byte)((bytesCount >> 8) & 0xFF);
                                    header[14] = (byte)((bytesCount >> 16) & 0xFF);
                                    header[15] = (byte)((bytesCount >> 24) & 0xFF);

                                    lock (tcpStream)
                                    {
                                        tcpStream.Write(header, 0, 16);
                                        tcpStream.Write(rgbBuffer, 0, bytesCount);
                                        tcpStream.Flush();
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
            System.Threading.Thread.Sleep(33); // ~30 FPS
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
        LogToFile("=== InputSimulator.exe Iniciado ===");
        DisableQuickEdit();
        try { SetProcessDpiAwareness(2); } catch {}
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
                    {
                        tcpStream = stream;
                        Console.WriteLine("[Simulator] Agente Node.js conectado no canal TCP de FRAMES");
                        using (StreamReader reader = new StreamReader(stream, System.Text.Encoding.UTF8))
                        {
                            string line;
                            while ((line = reader.ReadLine()) != null)
                            {
                                try
                                {
                                    Match typeMatch = typeRegex.Match(line);
                                    if (!typeMatch.Success) continue;
                                    string type = typeMatch.Groups[1].Value;
                                    LogToFile("Recebido comando de frames: " + line);

                                    if (type == "start_capture")
                                    {
                                        StartCapture();
                                    }
                                    else if (type == "stop_capture")
                                    {
                                        StopCapture();
                                    }
                                    else if (type == "select_screen")
                                    {
                                        Regex indexRegex = new Regex("\"index\"\\s*:\\s*([0-9]+)", RegexOptions.Compiled);
                                        Match indexMatch = indexRegex.Match(line);
                                        if (indexMatch.Success)
                                        {
                                            int index = int.Parse(indexMatch.Groups[1].Value);
                                            LogToAgent("[Simulator] Mudando para tela indice: " + index);
                                            selectedScreenIndex = index;
                                        }
                                    }
                                }
                                catch {}
                            }
                        }
                        tcpStream = null;
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
                        using (StreamReader reader = new StreamReader(stream, System.Text.Encoding.UTF8))
                        {
                            string line;
                            while ((line = reader.ReadLine()) != null)
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
            }
            catch {}
        }
    }
}
