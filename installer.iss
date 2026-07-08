; Script do Inno Setup para Innova Remote Cloud Agent com Wizard de Configuração e Inicialização Invisível
#define MyAppName "Innova Remote Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Innova"
#define MyAppExeName "InnovaRemoteAgent.exe"
#define MyAppLauncherName "launcher.vbs"

[Setup]
; Informações do Aplicativo
AppId={{D37D3E2F-65C1-4D3B-B03B-DF39EF07FDFE}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Configuração de Build
OutputDir=.
OutputBaseFilename=InnovaRemoteAgentSetup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar um ícone na Área de Trabalho"; GroupDescription: "Ícones adicionais:"; Flags: unchecked
Name: "startup"; Description: "Iniciar automaticamente com o Windows"; GroupDescription: "Configurações de Inicialização:"

[Files]
Source: "c:\Users\Innova\Documents\GitHub\acessoremotocloud\InnovaRemoteAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "c:\Users\Innova\Documents\GitHub\acessoremotocloud\launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppLauncherName}"" ""{app}\{#MyAppExeName}"""; IconFilename: "{app}\{#MyAppExeName}"; IconIndex: 0
Name: "{autodesktop}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppLauncherName}"" ""{app}\{#MyAppExeName}"""; IconFilename: "{app}\{#MyAppExeName}"; IconIndex: 0; Tasks: desktopicon

[Registry]
; Adiciona inicialização automática invisível com o Windows se a Task correspondente for marcada
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "InnovaRemoteAgent"; ValueData: "wscript.exe ""{app}\{#MyAppLauncherName}"" ""{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\InnovaRemoteAgent"
Type: filesandordirs; Name: "{app}"

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM InnovaRemoteAgent.exe"; Flags: runhidden
Filename: "taskkill"; Parameters: "/F /IM InputSimulator.exe"; Flags: runhidden

[Run]
Description: "Iniciar o Innova Remote Agent agora (em background)"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppLauncherName}"" ""{app}\{#MyAppExeName}"""; Flags: nowait postinstall skipifsilent

[Code]
var
  ConfigPage: TInputQueryWizardPage;

function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  // Finaliza processos ativos que possam bloquear a gravação
  Exec('taskkill', '/F /IM InnovaRemoteAgent.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill', '/F /IM InputSimulator.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function ObfuscateToHex(Text: String): String;
var
  I: Integer;
  Key: Byte;
  HexStr: String;
begin
  Key := 42;
  Result := '';
  for I := 1 to Length(Text) do
  begin
    HexStr := Format('%02x', [Ord(Text[I]) xor Key]);
    Result := Result + HexStr;
  end;
end;

procedure InitializeWizard;
var
  DefaultComputerName: String;
  DefaultPin: String;
  RandomPin: Integer;
begin
  // Gera o PIN aleatório diretamente
  RandomPin := 100000 + Random(900000);
  DefaultPin := IntToStr(RandomPin);

  // Obtém o nome padrão do computador
  DefaultComputerName := GetComputerNameString;

  // Cria a página personalizada após a seleção de diretório
  ConfigPage := CreateInputQueryPage(wpSelectDir,
    'Configurações do Agente', 'Insira as credenciais do agente remoto.',
    'Estes dados associam este computador ao painel de nuvem e protegem a conexão.');

  // Adiciona campos
  ConfigPage.Add('Nome do Computador:', False);
  ConfigPage.Add('PIN de Acesso (6 dígitos):', False);
  ConfigPage.Add('Servidor Central (URL):', False);

  // Define os valores padrão
  ConfigPage.Values[0] := DefaultComputerName;
  ConfigPage.Values[1] := DefaultPin;
  ConfigPage.Values[2] := 'wss://remoto.innova.id/ws';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  JsonContent: String;
  ComputerNameVal, PinVal, ServerVal: String;
begin
  if CurStep = ssPostInstall then
  begin
    ComputerNameVal := ConfigPage.Values[0];
    PinVal := ConfigPage.Values[1];
    ServerVal := ConfigPage.Values[2];

    // Validações básicas antes de salvar
    if Trim(ComputerNameVal) = '' then
      ComputerNameVal := GetComputerNameString;
    if Length(Trim(PinVal)) <> 6 then
      PinVal := '123456';
    if Trim(ServerVal) = '' then
      ServerVal := 'wss://remoto.innova.id/ws';

    // Monta o JSON
    JsonContent := '{' + #13#10 +
                   '  "computerName": "' + ComputerNameVal + '",' + #13#10 +
                   '  "pin": "' + PinVal + '",' + #13#10 +
                   '  "centralServer": "' + ServerVal + '"' + #13#10 +
                   '}';

    // Ofusca o conteúdo para proteger
    JsonContent := ObfuscateToHex(JsonContent);

    // Cria a pasta de destino caso não exista e salva o JSON
    ForceDirectories(ExpandConstant('{localappdata}\InnovaRemoteAgent'));
    SaveStringToFile(ExpandConstant('{localappdata}\InnovaRemoteAgent\config.json'), JsonContent, False);
  end;
end;
