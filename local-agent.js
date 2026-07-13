const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');
const crypto = require('crypto');
const net = require('net');

const isPackaged = typeof process.pkg !== 'undefined';

// Define o diretório de dados do usuário (evita problemas de permissão de Administrador)
const DATA_DIR = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir(), 'InnovaRemoteAgent');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function logToFile(msg) {
  try {
    fs.appendFileSync('c:\\Users\\Innova\\Documents\\GitHub\\acessoremotocloud\\debug_agent.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

logToFile("=== Agente Iniciado ===");

// Oculta a janela do console caso esteja empacotado (produção)
if (isPackaged) {
  const hideConsoleCommand = `powershell -NoProfile -Command "
    $member = '[DllImport(\\"kernel32.dll\\")] public static extern IntPtr GetConsoleWindow(); [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);';
    $type = Add-Type -MemberDefinition $member -Name Win32Utils -Namespace Win32 -PassThru;
    $handle = $type::GetConsoleWindow();
    if ($handle -ne [IntPtr]::Zero) {
        $type::ShowWindow($handle, 0);
    }
  "`;
  exec(hideConsoleCommand);
}

// Inicializa o System Tray em background
function startSystemTray(configFilePath) {
  const exePath = process.execPath;
  const parentId = process.pid;
  
  const psTrayScript = `
    Add-Type -AssemblyName System.Windows.Forms;
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon("${exePath.replace(/\\/g, '\\\\')}");
    $ni = New-Object System.Windows.Forms.NotifyIcon;
    $ni.Icon = $icon;
    $ni.Text = "Innova Remote Agent";
    $ni.Visible = $true;

    $menu = New-Object System.Windows.Forms.ContextMenuStrip;
    
    $itemInfo = $menu.Items.Add("Innova Remote Agent (Ativo)");
    $itemInfo.Enabled = $false;
    
    $menu.Items.Add("-") | Out-Null;

    $itemConfig = $menu.Items.Add("Abrir Configurações");
    $itemConfig.add_Click({
        Start-Process notepad.exe "${configFilePath.replace(/\\/g, '\\\\')}";
    });

    $itemExit = $menu.Items.Add("Sair");
    $itemExit.add_Click({
        $ni.Visible = $false;
        Stop-Process -Id ${parentId} -Force;
        Exit;
    });

    $ni.ContextMenuStrip = $menu;
    [System.Windows.Forms.Application]::Run();
  `;

  const encodedScript = Buffer.from(psTrayScript, 'utf16le').toString('base64');
  const trayProc = spawn('powershell', ['-NoProfile', '-EncodedCommand', encodedScript], {
    detached: true,
    stdio: 'ignore'
  });
  trayProc.unref();
}

let EXE_FILE;
if (isPackaged) {
  EXE_FILE = path.join(DATA_DIR, 'InputSimulator.exe');
  const embedExePath = path.join(__dirname, 'InputSimulator.exe');
  
  try {
    if (!fs.existsSync(EXE_FILE)) {
      console.log('Extraindo InputSimulator.exe embutido...');
      fs.writeFileSync(EXE_FILE, fs.readFileSync(embedExePath));
    }
  } catch (err) {
    console.error('Falha ao extrair InputSimulator.exe:', err.message);
    process.exit(1);
  }
} else {
  EXE_FILE = path.join(__dirname, 'InputSimulator.exe');
}

// 1. Compilar o simulador C# se o .exe não existir (Apenas modo desenvolvimento)
if (!isPackaged && !fs.existsSync(EXE_FILE)) {
  console.log('Compilando InputSimulator.cs...');
  const CS_FILE = path.join(__dirname, 'InputSimulator.cs');
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  
  if (!fs.existsSync(cscPath)) {
    console.error('Compilador csc.exe não encontrado no caminho padrão do Windows.');
    process.exit(1);
  }

  try {
    execSync(`"${cscPath}" /r:System.Drawing.dll,System.Windows.Forms.dll /out:"${EXE_FILE}" "${CS_FILE}"`);
    console.log('Compilado com sucesso: InputSimulator.exe');
  } catch (err) {
    console.error('Falha ao compilar InputSimulator.cs:', err.message);
    process.exit(1);
  }
}

// 2. Funções de Ofuscação de Dados (para proteger o config.json)
function deobfuscateFromHex(hex) {
  let result = '';
  const key = 42;
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substring(i, i + 2), 16);
    result += String.fromCharCode(charCode ^ key);
  }
  return result;
}

function obfuscateToHex(text) {
  let result = '';
  const key = 42;
  for (let i = 0; i < text.length; i++) {
    const hex = (text.charCodeAt(i) ^ key).toString(16).padStart(2, '0');
    result += hex;
  }
  return result;
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
let config = {
  id: crypto.randomUUID(),
  computerName: os.hostname(),
  pin: Math.floor(100000 + Math.random() * 900000).toString(),
  centralServer: 'wss://remoto.innova.id/ws'
};

if (!fs.existsSync(CONFIG_FILE)) {
  console.log('Primeira inicialização detectada. Abrindo assistente de configuração...');
  const defaultComputerName = os.hostname();
  const defaultPin = Math.floor(100000 + Math.random() * 900000).toString();
  const defaultServer = 'wss://remoto.innova.id/ws';
  
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms;
    Add-Type -AssemblyName System.Drawing;
    $form = New-Object System.Windows.Forms.Form;
    $form.Text = 'Configuração - Innova Remote Cloud';
    $form.Size = New-Object System.Drawing.Size(380,320);
    $form.StartPosition = 'CenterScreen';
    $form.FormBorderStyle = 'FixedDialog';
    $form.MaximizeBox = $false;

    $lblComputer = New-Object System.Windows.Forms.Label;
    $lblComputer.Text = 'Nome do Computador (Identificação):';
    $lblComputer.Location = New-Object System.Drawing.Point(20,20);
    $lblComputer.Size = New-Object System.Drawing.Size(300,20);
    $txtComputer = New-Object System.Windows.Forms.TextBox;
    $txtComputer.Text = '${defaultComputerName}';
    $txtComputer.Location = New-Object System.Drawing.Point(20,40);
    $txtComputer.Size = New-Object System.Drawing.Size(320,20);

    $lblPin = New-Object System.Windows.Forms.Label;
    $lblPin.Text = 'PIN de Acesso (6 dígitos):';
    $lblPin.Location = New-Object System.Drawing.Point(20,80);
    $lblPin.Size = New-Object System.Drawing.Size(300,20);
    $txtPin = New-Object System.Windows.Forms.TextBox;
    $txtPin.Text = '${defaultPin}';
    $txtPin.Location = New-Object System.Drawing.Point(20,100);
    $txtPin.Size = New-Object System.Drawing.Size(320,20);

    $lblServer = New-Object System.Windows.Forms.Label;
    $lblServer.Text = 'Servidor Central (Sinalização):';
    $lblServer.Location = New-Object System.Drawing.Point(20,140);
    $lblServer.Size = New-Object System.Drawing.Size(300,20);
    $txtServer = New-Object System.Windows.Forms.TextBox;
    $txtServer.Text = '${defaultServer}';
    $txtServer.Location = New-Object System.Drawing.Point(20,160);
    $txtServer.Size = New-Object System.Drawing.Size(320,20);

    $btnSave = New-Object System.Windows.Forms.Button;
    $btnSave.Text = 'Salvar e Conectar';
    $btnSave.Location = New-Object System.Drawing.Point(20,210);
    $btnSave.Size = New-Object System.Drawing.Size(320,40);
    $btnSave.Add_Click({
        $script:out = "$($txtComputer.Text)|$($txtPin.Text)|$($txtServer.Text)";
        $form.Close();
    });

    $form.Controls.Add($lblComputer);
    $form.Controls.Add($txtComputer);
    $form.Controls.Add($lblPin);
    $form.Controls.Add($txtPin);
    $form.Controls.Add($lblServer);
    $form.Controls.Add($txtServer);
    $form.Controls.Add($btnSave);

    $form.ShowDialog() | Out-Null;
    Write-Output $script:out;
  `;
  
  try {
    const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
    const result = execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`).toString().trim();
    if (result && result.includes('|')) {
      const [name, pin, server] = result.split('|');
      config.computerName = name || defaultComputerName;
      config.pin = pin || defaultPin;
      config.centralServer = server || defaultServer;
    }
  } catch (err) {
    console.warn('Não foi possível exibir a interface gráfica. Usando configurações padrão.', err.message);
  }

  try {
    const encryptedData = obfuscateToHex(JSON.stringify(config, null, 2));
    fs.writeFileSync(CONFIG_FILE, encryptedData);
  } catch (err) {
    console.error('Erro ao criar config.json ofuscado:', err.message);
  }
} else {
  try {
    let raw = fs.readFileSync(CONFIG_FILE, 'utf8').trim();
    // Suporte retrocompatível para JSON plano
    if (!raw.startsWith('{')) {
      raw = deobfuscateFromHex(raw);
    }
    config = { ...config, ...JSON.parse(raw) };
    
    // Garante que o ID exista nas configurações antigas
    if (!config.id) {
      config.id = crypto.randomUUID();
      const encryptedData = obfuscateToHex(JSON.stringify(config, null, 2));
      fs.writeFileSync(CONFIG_FILE, encryptedData);
    }
  } catch (err) {
    console.error('Erro ao ler config.json:', err.message);
  }
}

console.log('\n====================================');
console.log(`💻 COMPUTADOR: ${config.computerName}`);
console.log(`🔑 PIN DE SEGURANÇA: ${config.pin}`);
console.log(`🆔 ID EXCLUSIVO: ${config.id}`);
console.log(`🌐 SERVIDOR CENTRAL: ${config.centralServer}`);
console.log('====================================\n');

// Mapeamento de KeyboardEvent.code para Windows Virtual Key Codes (VK)
const VK_MAP = {
  'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44, 'KeyE': 0x45, 'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48,
  'KeyI': 0x49, 'KeyJ': 0x4A, 'KeyK': 0x4B, 'KeyL': 0x4C, 'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F, 'KeyP': 0x50,
  'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54, 'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58,
  'KeyY': 0x59, 'KeyZ': 0x5A,
  'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33, 'Digit4': 0x34, 'Digit5': 0x35, 'Digit6': 0x36,
  'Digit7': 0x37, 'Digit8': 0x38, 'Digit9': 0x39,
  'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77, 'F9': 0x78,
  'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
  'Enter': 0x0D, 'NumpadEnter': 0x0D, 'Escape': 0x1B, 'Space': 0x20, 'Backspace': 0x08, 'Tab': 0x09,
  'ShiftLeft': 0xA0, 'ShiftRight': 0xA1, 'ControlLeft': 0xA2, 'ControlRight': 0xA3, 'AltLeft': 0x12, 'AltRight': 0x12,
  'MetaLeft': 0x5B, 'MetaRight': 0x5C,
  'ArrowLeft': 0x25, 'ArrowUp': 0x26, 'ArrowRight': 0x27, 'ArrowDown': 0x28,
  'Delete': 0x2E, 'Insert': 0x2D, 'Home': 0x24, 'End': 0x23, 'PageUp': 0x21, 'PageDown': 0x22,
  'CapsLock': 0x14, 'ScrollLock': 0x91, 'NumLock': 0x90,
  'Semicolon': 0xBA, 'Equal': 0xBB, 'Comma': 0xBC, 'Minus': 0xBD, 'Period': 0xBE, 'Slash': 0xBF,
  'Backquote': 0xC0, 'BracketLeft': 0xDB, 'Backslash': 0xDC, 'BracketRight': 0xDD, 'Quote': 0xDE
};

let psInputHelper = null;

function startInputHelper() {
  const scriptPath = path.join(__dirname, 'scratch', 'input-helper.ps1');
  console.log('Iniciando input-helper.ps1 em background...');
  psInputHelper = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]);

  psInputHelper.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[InputHelper] STDOUT: ${msg}`);
  });

  psInputHelper.stderr.on('data', (data) => {
    console.error(`[InputHelper] STDERR: ${data.toString().trim()}`);
  });

  psInputHelper.on('close', (code) => {
    console.warn(`[InputHelper] Processo fechado com código ${code}. Reiniciando...`);
    setTimeout(startInputHelper, 1000);
  });
}

startInputHelper();

function sendInputToHelper(cmd) {
  if (psInputHelper && psInputHelper.stdin.writable) {
    psInputHelper.stdin.write(cmd + '\n');
  }
}

// 3. Iniciar o processo do InputSimulator (com janela visível para manter privilégios interativos)
console.log('Iniciando InputSimulator.exe...');
const cmdLine = `cmd.exe /c start "" "${EXE_FILE}"`;
exec(cmdLine, (err) => {
  if (err) console.error('Erro ao iniciar InputSimulator.exe:', err.message);
});

function getMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const netInterface of interfaces[name]) {
      if (!netInterface.internal && netInterface.mac && netInterface.mac !== '00:00:00:00:00:00') {
        return netInterface.mac.toUpperCase();
      }
    }
  }
  return 'DESCONHECIDO';
}

let screens = [];
let selectedScreenIndex = 0;

function updateScreenDimensions() {
  try {
    const output = execSync('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { \\"$($_.Bounds.X),$($_.Bounds.Y),$($_.Bounds.Width),$($_.Bounds.Height),$($_.Primary)\\" }"', { encoding: 'utf8' });
    const lines = output.trim().split(/\r?\n/);
    screens = lines.map((line, idx) => {
      const parts = line.split(',');
      if (parts.length >= 5) {
        return {
          index: idx,
          x: parseInt(parts[0].trim()) || 0,
          y: parseInt(parts[1].trim()) || 0,
          width: parseInt(parts[2].trim()) || 1920,
          height: parseInt(parts[3].trim()) || 1080,
          primary: parts[4].trim().toLowerCase() === 'true'
        };
      }
      return null;
    }).filter(Boolean);
    
    const primaryIdx = screens.findIndex(s => s.primary);
    selectedScreenIndex = primaryIdx >= 0 ? primaryIdx : 0;
    console.log('[Agente] Monitores detectados:', JSON.stringify(screens));
  } catch (err) {
    console.error('Erro ao ler dimensões da tela:', err.message);
    screens = [{ index: 0, x: 0, y: 0, width: 2560, height: 1080, primary: true }];
    selectedScreenIndex = 0;
  }
}

updateScreenDimensions();

const inputQueue = [];
let isProcessingInput = false;
let processorImmediate = null;

function scheduleInputProcessor() {
  if (processorImmediate) return;
  processorImmediate = setImmediate(() => {
    processorImmediate = null;
    processInputQueue();
  });
}

function processInputQueue() {
  if (isProcessingInput || inputQueue.length === 0) return;
  isProcessingInput = true;

  while (inputQueue.length > 0) {
    const action = inputQueue.shift();
    try {
      const screen = screens[selectedScreenIndex] || screens[0] || { x: 0, y: 0, width: 2560, height: 1080 };
      
      if (action.type === 'mousemove') {
        const localX = Math.round(action.x * screen.width);
        const localY = Math.round(action.y * screen.height);
        const absoluteX = screen.x + localX;
        const absoluteY = screen.y + localY;
        sendToSimulator({ type: 'mousemove', x: absoluteX, y: absoluteY });
      } 
      else if (action.type === 'mousedown') {
        if (action.x !== undefined && action.y !== undefined) {
          const localX = Math.round(action.x * screen.width);
          const localY = Math.round(action.y * screen.height);
          const absoluteX = screen.x + localX;
          const absoluteY = screen.y + localY;
          sendToSimulator({ type: 'mousemove', x: absoluteX, y: absoluteY });
        }
        
        console.log(`[Agente] Clique - Pressionar botão (via C# Simulator): ${action.button}`);
        sendToSimulator({ type: 'mousedown', button: action.button });
      } 
      else if (action.type === 'mouseup') {
        if (action.x !== undefined && action.y !== undefined) {
          const localX = Math.round(action.x * screen.width);
          const localY = Math.round(action.y * screen.height);
          const absoluteX = screen.x + localX;
          const absoluteY = screen.y + localY;
          sendToSimulator({ type: 'mousemove', x: absoluteX, y: absoluteY });
        }
        
        console.log(`[Agente] Clique - Soltar botão (via C# Simulator): ${action.button}`);
        sendToSimulator({ type: 'mouseup', button: action.button });
      } 
      else if (action.type === 'keydown') {
        const vk = VK_MAP[action.code];
        if (vk !== undefined) {
          console.log(`[Agente] Teclado - Pressionar tecla: ${action.code} (VK: ${vk})`);
          sendToSimulator({ type: 'keydown', vk: vk });
        }
      }
      else if (action.type === 'keyup') {
        const vk = VK_MAP[action.code];
        if (vk !== undefined) {
          sendToSimulator({ type: 'keyup', vk: vk });
        }
      }
    } catch (err) {
      console.error('Erro ao processar ação de input:', err.message);
    }
  }

  isProcessingInput = false;
}

let tcpSocketFrame = null;
let tcpSocketInput = null;
let reconnectTimerFrame = null;
let reconnectTimerInput = null;
let stdoutBuffer = '';
let wsClient = null;
let isAuthenticated = false;

// Configuração WebRTC
const wrtc = require('@roamhq/wrtc');
const { RTCVideoSource, rgbaToI420 } = wrtc.nonstandard;

const videoSource = new RTCVideoSource();
const videoTrack = videoSource.createTrack();
try {
  videoTrack.contentHint = 'detail';
} catch (e) {
  console.warn('Não foi possível definir contentHint no videoTrack:', e.message);
}
const mediaStream = new wrtc.MediaStream();
mediaStream.addTrack(videoTrack);
let peerConnection = null;
let tcpBuffer = Buffer.alloc(0);

function closePeerConnection() {
  if (peerConnection) {
    try {
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
    } catch {}
    try {
      const senders = peerConnection.getSenders();
      for (const sender of senders) {
        try {
          peerConnection.removeTrack(sender);
        } catch {}
      }
    } catch {}
    try {
      peerConnection.close();
    } catch {}
    peerConnection = null;
    console.log('Conexão WebRTC fechada.');
  }
}

let cachedI420Frame = null;
let cachedRgbaFrame = null;

function handleIncomingRgbaFrame(width, height, rgbaBuffer) {
  // Envia frame apenas se houver conexão ativa estabelecida
  if (peerConnection && peerConnection.connectionState === 'connected') {
    try {
      // Re-aloca ou cria o buffer I420 cacheado se a resolução mudar ou for a primeira execução
      if (!cachedI420Frame || cachedI420Frame.width !== width || cachedI420Frame.height !== height) {
        cachedI420Frame = {
          width: width,
          height: height,
          data: new Uint8ClampedArray(1.5 * width * height)
        };
      }

      // Re-aloca ou cria o buffer RGBA cacheado (com ArrayBuffer exclusivo do tamanho exato da imagem)
      if (!cachedRgbaFrame || cachedRgbaFrame.width !== width || cachedRgbaFrame.height !== height) {
        cachedRgbaFrame = {
          width: width,
          height: height,
          data: new Uint8ClampedArray(width * height * 4)
        };
      }

      // Copia ultra-rápida na memória cacheada preexistente (0 alocações adicionais no loop)
      cachedRgbaFrame.data.set(rgbaBuffer);

      // Realiza a conversão de RGBA para I420 in-place na memória cacheada
      rgbaToI420(cachedRgbaFrame, cachedI420Frame);

      // Injeta o frame I420 convertido no WebRTC
      videoSource.onFrame(cachedI420Frame);
    } catch (err) {
      console.error('Erro ao injetar frame no WebRTC:', err.message);
    }
  }
}

function connectFrameSocket() {
  if (reconnectTimerFrame) clearTimeout(reconnectTimerFrame);
  if (tcpSocketFrame && !tcpSocketFrame.destroyed) {
    tcpSocketFrame.removeAllListeners();
    tcpSocketFrame.destroy();
  }
  
  tcpSocketFrame = net.createConnection({ port: 9997, host: '127.0.0.1' }, () => {
    tcpSocketFrame.setNoDelay(true);
    console.log('✅ Conectado ao InputSimulator (Frames) via TCP (Porta 9997)!');
    if (isAuthenticated) {
      console.log('Solicitando início de captura de tela ao simulador...');
      sendFrameControlToSimulator({ type: 'start_capture' });
    }
  });

  tcpSocketFrame.on('data', (chunk) => {
    tcpBuffer = Buffer.concat([tcpBuffer, chunk]);

    while (tcpBuffer.length >= 16) {
      const magic = tcpBuffer.toString('utf8', 0, 4);
      const width = tcpBuffer.readInt32LE(4);
      const height = tcpBuffer.readInt32LE(8);
      const payloadSize = tcpBuffer.readInt32LE(12);

      if (tcpBuffer.length < 16 + payloadSize) {
        break; // Aguarda mais dados do payload
      }

      const payload = tcpBuffer.slice(16, 16 + payloadSize);
      tcpBuffer = tcpBuffer.slice(16 + payloadSize);

      if (magic === 'FRME') {
        handleIncomingRgbaFrame(width, height, payload);
      } else if (magic === 'LOG_') {
        const message = payload.toString('utf8');
        console.log(`[InputSimulator]: ${message}`);
      } else {
        console.error(`[InputSimulator] Protocolo corrompido, magic inválido: ${magic}`);
        tcpBuffer = Buffer.alloc(0);
        break;
      }
    }
  });

  tcpSocketFrame.on('error', () => {
    reconnectTimerFrame = setTimeout(connectFrameSocket, 2000);
  });

  tcpSocketFrame.on('close', () => {
    reconnectTimerFrame = setTimeout(connectFrameSocket, 2000);
  });
}

function connectInputSocket() {
  if (reconnectTimerInput) clearTimeout(reconnectTimerInput);
  if (tcpSocketInput && !tcpSocketInput.destroyed) {
    tcpSocketInput.removeAllListeners();
    tcpSocketInput.destroy();
  }

  tcpSocketInput = net.createConnection({ port: 9998, host: '127.0.0.1' }, () => {
    tcpSocketInput.setNoDelay(true);
    console.log('✅ Conectado ao InputSimulator (Inputs) via TCP (Porta 9998)!');
  });

  tcpSocketInput.on('error', () => {
    reconnectTimerInput = setTimeout(connectInputSocket, 2000);
  });

  tcpSocketInput.on('close', () => {
    reconnectTimerInput = setTimeout(connectInputSocket, 2000);
  });
}

connectFrameSocket();
connectInputSocket();

function sendToSimulator(payload) {
  if (tcpSocketInput && !tcpSocketInput.destroyed) {
    tcpSocketInput.write(JSON.stringify(payload) + '\n');
  }
}

function sendFrameControlToSimulator(payload) {
  if (tcpSocketFrame && !tcpSocketFrame.destroyed) {
    tcpSocketFrame.write(JSON.stringify(payload) + '\n');
  }
}

// 4. Conectar e manter canal com o Servidor Central
function connectToCentralServer() {
  console.log('Conectando ao servidor central...');
  
  const connectionUrl = `${config.centralServer}?role=agent&id=${config.id}&name=${encodeURIComponent(config.computerName)}&mac=${encodeURIComponent(getMacAddress())}`;
  wsClient = new WebSocket(connectionUrl, {
    rejectUnauthorized: false
  });

  wsClient.on('open', () => {
    console.log('✅ Conexão estabelecida com o servidor central!');
  });

  wsClient.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'auth') {
        if (data.password === config.pin) {
          isAuthenticated = true;
          wsClient.send(JSON.stringify({ 
            type: 'auth-success', 
            computerName: config.computerName,
            pin: config.pin,
            screens: screens,
            selectedScreenIndex: selectedScreenIndex
          }));
          console.log('Cliente remoto autenticado via Nuvem. Iniciando captura de tela...');
          updateScreenDimensions();
          sendFrameControlToSimulator({ type: 'start_capture' });
        } else {
          wsClient.send(JSON.stringify({ type: 'auth-error', message: 'PIN de segurança incorreto!' }));
          console.log('Tentativa de autenticação com PIN inválido.');
        }
      } 
      
      else if (data.type === 'stop-capture-relay') {
        console.log('Sessão fechada pelo Dashboard. Parando captura de tela e limpando WebRTC.');
        isAuthenticated = false;
        closePeerConnection();
        sendFrameControlToSimulator({ type: 'stop_capture' });
      }

      else if (isAuthenticated) {
        if (data.type === 'ping') {
          wsClient.send(JSON.stringify({ type: 'pong', time: data.time }));
        } 

        else if (data.type === 'webrtc-offer') {
          console.log('Recebido webrtc-offer do cliente...');
          closePeerConnection(); // Fecha conexão WebRTC anterior se houver

          peerConnection = new wrtc.RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.cloudflare.com:3478' },
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });

          // Adiciona a faixa de vídeo capturada do C# ao WebRTC associada ao stream
          peerConnection.addTrack(videoTrack, mediaStream);

          peerConnection.onicecandidate = (event) => {
            if (event.candidate && wsClient && wsClient.readyState === WebSocket.OPEN) {
              wsClient.send(JSON.stringify({
                type: 'webrtc-candidate',
                candidate: event.candidate
              }));
            }
          };

          peerConnection.onconnectionstatechange = () => {
            console.log(`WebRTC Connection State: ${peerConnection.connectionState}`);
            if (peerConnection.connectionState === 'disconnected' || 
                peerConnection.connectionState === 'failed' || 
                peerConnection.connectionState === 'closed') {
              closePeerConnection();
            }
          };

          try {
            await peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            wsClient.send(JSON.stringify({
              type: 'webrtc-answer',
              answer: answer
            }));
            console.log('Resposta webrtc-answer enviada ao cliente com sucesso.');
          } catch (err) {
            console.error('Erro ao configurar WebRTC PeerConnection:', err);
          }
        }

        else if (data.type === 'webrtc-candidate') {
          if (peerConnection) {
            try {
              await peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
            } catch (err) {
              console.error('Erro ao adicionar ICE candidate recebido:', err);
            }
          }
        }

        else if (data.type === 'select-screen') {
          const index = parseInt(data.index);
          logToFile(`Recebido select-screen para monitor: ${index}. Total de telas disponíveis: ${screens.length}`);
          if (index >= 0 && index < screens.length) {
            selectedScreenIndex = index;
            console.log(`[Agente] Solicitando ao simulador mudança para o Monitor ${index}`);
            logToFile(`Enviando select_screen para o simulador C# no índice: ${index}`);
            sendFrameControlToSimulator({ type: 'select_screen', index: index });
          } else {
            logToFile(`Índice ${index} inválido ou fora dos limites do screens array`);
          }
        }

        else if (data.type === 'input') {
          const action = data.action;
          
          // Otimização: se for mousemove e o último item na fila também for mousemove,
          // substitui o último para evitar atraso/lag acumulado!
          if (action.type === 'mousemove' && inputQueue.length > 0 && inputQueue[inputQueue.length - 1].type === 'mousemove') {
            inputQueue[inputQueue.length - 1] = action;
          } else {
            inputQueue.push(action);
          }
          scheduleInputProcessor();
        }
      }
    } catch (err) {
      console.error('Erro ao processar mensagem do servidor central:', err);
    }
  });

  wsClient.on('close', () => {
    console.log('❌ Conexão com o servidor central perdida. Tentando reconectar em 5 segundos...');
    isAuthenticated = false;
    closePeerConnection();
    sendFrameControlToSimulator({ type: 'stop_capture' });
    setTimeout(connectToCentralServer, 5000);
  });

  wsClient.on('error', (err) => {
    console.error('Erro no cliente WebSocket do agente:', err.message);
  });
}

// Inicia conexão
connectToCentralServer();

// Inicia o System Tray em produção
if (isPackaged) {
  startSystemTray(CONFIG_FILE);
}

process.on('SIGINT', () => {
  console.log('Encerrando Agente Local...');
  if (tcpSocketFrame) tcpSocketFrame.end();
  if (tcpSocketInput) tcpSocketInput.end();
  process.exit(0);
});
