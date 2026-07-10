const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const url = require('url');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// 1. Carregar ou criar configurações de segurança do servidor
const CONFIG_FILE = path.join(process.cwd(), 'server-config.json');
let serverConfig = {
  username: process.env.DASHBOARD_USERNAME || 'admin',
  password: process.env.DASHBOARD_PASSWORD || crypto.randomBytes(4).toString('hex') // Senha aleatória inicial de 8 caracteres
};

if (!process.env.DASHBOARD_USERNAME && !process.env.DASHBOARD_PASSWORD) {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      serverConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (err) {
      console.error('Erro ao ler server-config.json, usando padrão:', err.message);
    }
  } else {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfig, null, 2));
    } catch (err) {
      console.error('Erro ao criar server-config.json:', err.message);
    }
  }
}

// Armazena sessões ativas do dashboard
const activeSessions = new Set();

app.use(express.json());

// Auxiliar para ler cookies de requisição Express ou WS Upgrade
function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [key, val] = cookie.trim().split('=');
    if (key === name) return val;
  }
  return null;
}

// Middleware de Autenticação para proteger arquivos e APIs
function authMiddleware(req, res, next) {
  const publicRoutes = ['/login.html', '/api/login', '/style.css', '/logo.png'];
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  const token = getCookie(req.headers.cookie, 'session_token');
  if (token && activeSessions.has(token)) {
    return next();
  }

  res.redirect('/login.html');
}

app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// Rota de Login (POST)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === serverConfig.username && password === serverConfig.password) {
    const token = crypto.randomUUID();
    activeSessions.add(token);
    
    // Define cookie HttpOnly seguro para a sessão
    res.setHeader('Set-Cookie', `session_token=${token}; Path=/; HttpOnly; SameSite=Strict`);
    return res.json({ success: true });
  }

  res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
});

// Armazena agentes ativos: id -> { ws, name, id, isStreaming }
const agents = new Map();
// Armazena clientes ativos: ws -> targetId
const clients = new Map();

// Servir a lista de agentes online via REST API simples para o Dashboard
app.get('/api/agents', (req, res) => {
  const list = [];
  for (const [id, agent] of agents.entries()) {
    list.push({
      id: id,
      name: agent.name,
      status: agent.ws.readyState === WebSocket.OPEN ? 'online' : 'offline',
      isStreaming: agent.isStreaming || false
    });
  }
  res.json(list);
});

// Atualiza todos os dashboards conectados sobre a lista de agentes
function broadcastAgentList() {
  const list = [];
  for (const [id, agent] of agents.entries()) {
    list.push({
      id: id,
      name: agent.name,
      status: 'online',
      isStreaming: agent.isStreaming || false
    });
  }
  const payload = JSON.stringify({ type: 'agent-list', agents: list });
  
  for (const clientWs of clients.keys()) {
    if (clientWs.readyState === WebSocket.OPEN && !clients.get(clientWs)) {
      // Envia apenas para os clientes que estão no Dashboard geral (sem targetId ativo)
      clientWs.send(payload);
    }
  }
}

// Upgrade HTTP para WebSocket
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;
  const role = parsedUrl.query.role;

  // Se o cliente (Dashboard) estiver tentando conectar, valida a sessão
  if (role === 'client') {
    const token = getCookie(request.headers.cookie, 'session_token');
    if (!token || !activeSessions.has(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  const parsedUrl = url.parse(request.url, true);
  const role = parsedUrl.query.role; // 'agent' ou 'client'

  if (role === 'agent') {
    const id = parsedUrl.query.id;
    const name = parsedUrl.query.name || 'Computador Remoto';

    if (!id) {
      ws.close(4000, 'ID do agente é obrigatório');
      return;
    }

    console.log(`[Servidor] Agente conectado: ${name} (ID: ${id})`);
    
    // Se já houver um agente com esse ID, encerra a conexão antiga
    if (agents.has(id)) {
      const old = agents.get(id);
      old.ws.close();
    }

    agents.set(id, { ws, name, id, isStreaming: false });
    broadcastAgentList();

    ws.on('message', (message, isBinary) => {
      // Repassar tudo do agente para o respectivo cliente conectado
      const agentData = agents.get(id);
      if (agentData && agentData.clientWs && agentData.clientWs.readyState === WebSocket.OPEN) {
        // Controle de backpressure: verificar se o cliente está acompanhando
        // Se o buffer do WebSocket do cliente estiver cheio, descartar frames (mas nunca descartar comandos)
        const msgStr = isBinary ? null : message.toString();
        const isFrame = isBinary || (msgStr && msgStr.indexOf('"type":"frame"') !== -1);
        
        if (isFrame && agentData.clientWs.bufferedAmount > 256 * 1024) {
          // Pular este frame - o cliente não está consumindo rápido o suficiente
          return;
        }
        
        if (isBinary) {
          agentData.clientWs.send(message);
        } else {
          agentData.clientWs.send(msgStr);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[Servidor] Agente desconectado: ${name} (ID: ${id})`);
      const agentData = agents.get(id);
      if (agentData) {
        // Notifica cliente se estiver conectado
        if (agentData.clientWs && agentData.clientWs.readyState === WebSocket.OPEN) {
          agentData.clientWs.send(JSON.stringify({ type: 'error', message: 'Agente desconectou.' }));
          agentData.clientWs.close();
        }
        agents.delete(id);
      }
      broadcastAgentList();
    });

    ws.on('error', (err) => {
      console.error(`Erro no agente ${id}:`, err.message);
    });
  } 
  
  else if (role === 'client') {
    const targetId = parsedUrl.query.targetId;
    
    if (!targetId) {
      // Cliente conectou apenas para monitorar a lista (Dashboard Geral)
      console.log('[Servidor] Novo cliente monitorando o Dashboard');
      clients.set(ws, null);
      
      // Envia lista atual imediatamente
      const list = [];
      for (const [id, agent] of agents.entries()) {
        list.push({ id, name: agent.name, status: 'online', isStreaming: agent.isStreaming });
      }
      ws.send(JSON.stringify({ type: 'agent-list', agents: list }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'refresh') {
            const list = [];
            for (const [id, agent] of agents.entries()) {
              list.push({ id, name: agent.name, status: 'online', isStreaming: agent.isStreaming });
            }
            ws.send(JSON.stringify({ type: 'agent-list', agents: list }));
          }
        } catch {}
      });

      ws.on('close', () => {
        clients.delete(ws);
      });
      return;
    }

    // Cliente quer se conectar a um agente específico
    console.log(`[Servidor] Cliente tentando controlar o Agente ID: ${targetId}`);
    const agent = agents.get(targetId);

    if (!agent) {
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Computador offline ou não encontrado.' }));
      ws.close();
      return;
    }

    if (agent.clientWs) {
      console.log(`[Servidor] Agente ${targetId} já possuía uma sessão ativa. Encerrando sessão anterior.`);
      try {
        agent.clientWs.send(JSON.stringify({ type: 'error', message: 'Sessão encerrada pois uma nova conexão foi iniciada.' }));
        agent.clientWs.close();
      } catch (err) {
        console.error('Erro ao fechar conexão antiga:', err.message);
      }
      agent.clientWs = null;
    }

    // Vincula cliente e agente
    agent.clientWs = ws;
    agent.isStreaming = true;
    clients.set(ws, targetId);
    broadcastAgentList();

    ws.on('message', (message, isBinary) => {
      // Repassa comandos do cliente para o agente
      if (agent.ws && agent.ws.readyState === WebSocket.OPEN) {
        if (isBinary) {
          agent.ws.send(message);
        } else {
          agent.ws.send(message.toString());
        }
      }
    });

    ws.on('close', () => {
      console.log(`[Servidor] Cliente desconectou do Agente ID: ${targetId}`);
      if (agents.has(targetId)) {
        const activeAgent = agents.get(targetId);
        activeAgent.clientWs = null;
        activeAgent.isStreaming = false;
        // Envia comando para o agente parar a captura se não houver cliente
        if (activeAgent.ws && activeAgent.ws.readyState === WebSocket.OPEN) {
          activeAgent.ws.send(JSON.stringify({ type: 'stop-capture-relay' }));
        }
      }
      clients.delete(ws);
      broadcastAgentList();
    });

    ws.on('error', (err) => {
      console.error(`Erro no cliente controlado ${targetId}:`, err.message);
    });
  } 
  
  else {
    ws.close(4000, 'Função desconhecida');
  }
});

const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`\n====================================`);
  console.log(`🚀 SERVIDOR CENTRAL INICIADO NA PORTA: ${PORT}`);
  console.log(`👤 USUÁRIO DASHBOARD: ${serverConfig.username}`);
  console.log(`🔑 SENHA DASHBOARD: ${serverConfig.password}`);
  console.log(`🌐 DASHBOARD WEB: http://localhost:${PORT}`);
  console.log(`====================================\n`);
});
