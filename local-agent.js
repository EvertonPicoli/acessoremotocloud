const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');
const crypto = require('crypto');

const isPackaged = typeof process.pkg !== 'undefined';

// Define o diretório de dados do usuário (evita problemas de permissão de Administrador)
const DATA_DIR = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir(), 'InnovaRemoteAgent');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
const KEY_MAP = {
  'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44, 'KeyE': 0x45, 'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48,
  'KeyI': 0x49, 'KeyJ': 0x4A, 'KeyK': 0x4B, 'KeyL': 0x4C, 'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F, 'KeyP': 0x50,
  'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54, 'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58,
  'KeyY': 0x59, 'KeyZ': 0x5A,
  'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33, 'Digit4': 0x34, 'Digit5': 0x35, 'Digit6': 0x36,
  'Digit7': 0x37, 'Digit8': 0x38, 'Digit9': 0x39,
  'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77, 'F9': 0x78,
  'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
  'Enter': 0x0D, 'NumpadEnter': 0x0D,
  'Escape': 0x1B,
  'Space': 0x20,
  'Backspace': 0x08,
  'Tab': 0x09,
  'ShiftLeft': 0xA0, 'ShiftRight': 0xA1,
  'ControlLeft': 0xA2, 'ControlRight': 0xA3,
  'AltLeft': 0xA4, 'AltRight': 0xA5,
  'MetaLeft': 0x5B, 'MetaRight': 0x5C,
  'ArrowLeft': 0x25, 'ArrowUp': 0x26, 'ArrowRight': 0x27, 'ArrowDown': 0x28,
  'Delete': 0x2E, 'Insert': 0x2D, 'Home': 0x24, 'End': 0x23, 'PageUp': 0x21, 'PageDown': 0x22,
  'CapsLock': 0x14, 'ScrollLock': 0x91, 'NumLock': 0x90,
  'Semicolon': 0xBA, 'Equal': 0xBB, 'Comma': 0xBC, 'Minus': 0xBD, 'Period': 0xBE, 'Slash': 0xBF,
  'Backquote': 0xC0, 'BracketLeft': 0xDB, 'Backslash': 0xDC, 'BracketRight': 0xDD, 'Quote': 0xDE
};

// 3. Iniciar o processo do InputSimulator
console.log('Iniciando InputSimulator.exe...');
const inputSim = spawn(EXE_FILE);

inputSim.stderr.on('data', (data) => {
  console.error(`[InputSimulator Error]: ${data.toString().trim()}`);
});

inputSim.on('close', (code) => {
  console.log(`Processo InputSimulator finalizado com código ${code}`);
  process.exit(code);
});

// Buffer para ler stdout por linha (evita quebrar frames base64 longos)
let stdoutBuffer = '';
let wsClient = null;
let isAuthenticated = false;

inputSim.stdout.on('data', (data) => {
  stdoutBuffer += data.toString();
  let lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('FRAME:')) {
      const base64 = trimmed.substring(6);
      const payload = JSON.stringify({
        type: 'frame',
        image: base64
      });

      // Envia frame de vídeo para o servidor central (que repassará ao cliente)
      if (wsClient && wsClient.readyState === WebSocket.OPEN && isAuthenticated) {
        wsClient.send(payload);
      }
    } else {
      console.log(`[InputSimulator]: ${trimmed}`);
    }
  }
});

// 4. Conectar e manter canal com o Servidor Central
function connectToCentralServer() {
  console.log('Conectando ao servidor central...');
  
  const connectionUrl = `${config.centralServer}?role=agent&id=${config.id}&name=${encodeURIComponent(config.computerName)}`;
  wsClient = new WebSocket(connectionUrl);

  wsClient.on('open', () => {
    console.log('✅ Conexão estabelecida com o servidor central!');
  });

  wsClient.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'auth') {
        if (data.password === config.pin) {
          isAuthenticated = true;
          wsClient.send(JSON.stringify({ 
            type: 'auth-success', 
            computerName: config.computerName,
            pin: config.pin 
          }));
          console.log('Cliente remoto autenticado via Nuvem. Iniciando captura de tela...');
          inputSim.stdin.write(JSON.stringify({ type: 'start_capture' }) + '\n');
        } else {
          wsClient.send(JSON.stringify({ type: 'auth-error', message: 'PIN de segurança incorreto!' }));
          console.log('Tentativa de autenticação com PIN inválido.');
        }
      } 
      
      else if (data.type === 'stop-capture-relay') {
        console.log('Sessão fechada pelo Dashboard. Parando captura de tela.');
        isAuthenticated = false;
        inputSim.stdin.write(JSON.stringify({ type: 'stop_capture' }) + '\n');
      }

      else if (isAuthenticated) {
        if (data.type === 'ping') {
          wsClient.send(JSON.stringify({ type: 'pong', time: data.time }));
        } 
        
        else if (data.type === 'input') {
          const action = data.action;
          
          if (action.type === 'mousemove') {
            const scaledX = Math.round(action.x * 65535);
            const scaledY = Math.round(action.y * 65535);
            inputSim.stdin.write(JSON.stringify({
              type: 'mousemove',
              x: scaledX,
              y: scaledY
            }) + '\n');
          } 
          else if (action.type === 'mousedown' || action.type === 'mouseup') {
            inputSim.stdin.write(JSON.stringify({
              type: action.type,
              button: action.button
            }) + '\n');
          } 
          else if (action.type === 'keydown' || action.type === 'keyup') {
            const vk = KEY_MAP[action.code];
            if (vk !== undefined) {
              inputSim.stdin.write(JSON.stringify({
                type: action.type,
                vk: vk
              }) + '\n');
            }
          }
        }
      }
    } catch (err) {
      console.error('Erro ao processar mensagem do servidor central:', err);
    }
  });

  wsClient.on('close', () => {
    console.log('❌ Conexão com o servidor central perdida. Tentando reconectar em 5 segundos...');
    isAuthenticated = false;
    inputSim.stdin.write(JSON.stringify({ type: 'stop_capture' }) + '\n');
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
  if (inputSim) inputSim.kill();
  process.exit(0);
});
