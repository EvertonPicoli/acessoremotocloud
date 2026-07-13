# Guia Passo a Passo: Configurando o Coolify para Hospedar o Servidor

Este guia foi elaborado para quem nunca utilizou o **Coolify** e deseja colocar o servidor do **Acesso Remoto Cloud** no ar de maneira simples e rápida.

---

## 📌 O que é o Coolify?
O Coolify é uma alternativa autohospedada e gratuita a plataformas como Heroku, Render ou Railway. Com ele, você gerencia seus próprios servidores VPS e publica aplicações com poucos cliques a partir de um repositório do GitHub.

---

## 🚀 Passo 1: Preparar o Servidor VPS
Para rodar o Coolify, você precisa de um servidor virtual (VPS) limpo (de preferência com sistema operacional **Ubuntu 22.04 LTS** ou **Ubuntu 24.04 LTS**).

1. Contrate uma VPS em provedores como Hetzner, DigitalOcean, Linode, AWS ou qualquer outro de sua escolha.
   > **Configuração mínima sugerida:** 2 vCPUs e 2 GB de RAM.
2. Conecte-se ao seu servidor VPS via terminal (SSH).

---

## 📥 Passo 2: Instalar o Coolify na VPS
1. Com o terminal da sua VPS aberto, execute o comando de instalação oficial do Coolify:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
2. O script instalará o Docker e todas as dependências necessárias automaticamente.
3. Ao finalizar, o terminal mostrará um endereço IP acompanhado da porta `8000` (ex: `http://seu-ip:8000`).
4. Abra esse endereço no seu navegador de internet.
5. Crie a sua conta de administrador (defina seu e-mail e senha).

---

## 🔑 Passo 3: Conectar seu GitHub ao Coolify
Para que o Coolify possa obter o código do seu repositório automaticamente:

1. No painel do Coolify, clique em **Keys & Connections** (Chaves e Conexões) no menu lateral.
2. Vá em **Sources** (Fontes) e clique em **Add** (Adicionar) -> **GitHub App**.
3. Siga as instruções na tela para instalar o aplicativo do Coolify em sua conta do GitHub.
4. Conceda acesso ao repositório `EvertonPicoli/acessoremotocloud` (ou ao repositório onde seu código está).

---

## 🛠️ Passo 4: Criar um Novo Projeto no Coolify
1. No painel principal do Coolify, clique em **Projects** (Projetos).
2. Clique em **Add** (Adicionar) ou **+ New Project**.
3. Clique no ambiente padrão criado (**Production** / Produção).

---

## 🌐 Passo 5: Adicionar e Configurar a Aplicação
Agora vamos configurar o servidor contido na pasta `/server` do seu repositório.

1. Dentro do projeto, clique em **+ Add New Resource** (Adicionar Novo Recurso).
2. Escolha **Public/Private Repository (GitHub)**.
3. Selecione a sua conexão do GitHub instalada no Passo 3.
4. Escolha o repositório `EvertonPicoli/acessoremotocloud`.
5. Escolha a branch principal (ex: `main` ou `master`).
6. O Coolify começará a carregar as configurações do projeto.

### ⚙️ Configurações Críticas da Aplicação:
Na tela de configuração da aplicação que foi criada, ajuste as seguintes abas:

#### 1. General (Geral)
* **Build Pack:** Altere para **Dockerfile**.
* **Dockerfile Location (Caminho do Dockerfile):** Altere para `/server/Dockerfile`. 
  *(Como o Dockerfile está dentro da subpasta `server`, é necessário especificar esse caminho para o Coolify localizar)*.
* **Domains (Domínios):** Digite o domínio ou subdomínio que deseja usar (ex: `https://painel.seudominio.com` ou `http://seu-ip:4040`). O Coolify gerencia certificados SSL (HTTPS) automaticamente se você apontar um domínio DNS válido para o IP da VPS.

#### 2. Port (Porta)
* **Ports Exposes (Portas Expostas):** Certifique-se de definir para `4040` (que é a porta configurada no seu Dockerfile e no código Node.js).

#### 3. Environment Variables (Variáveis de Ambiente)
Aqui você pode definir o usuário e senha fixos para acessar o painel do seu Acesso Remoto. Se você não definir, o sistema gerará uma senha aleatória nova a cada reinicialização do container.

1. Vá até a aba **Environment Variables**.
2. Adicione as seguintes chaves de configuração:
   * **`PORT`**: `4040` (porta onde o servidor roda).
   * **`DASHBOARD_USERNAME`**: Digite o usuário que você deseja usar para fazer login (ex: `admin`).
   * **`DASHBOARD_PASSWORD`**: Digite a senha segura que deseja usar para o painel (ex: `SuaSenhaSegura123`).

---

## 🚢 Passo 6: Implantar (Deploy)
1. Com todas as configurações salvas, clique no botão **Deploy** (Implantar) no canto superior direito do Coolify.
2. Você pode acompanhar o progresso da construção em tempo real através da aba **Logs**.
3. Uma vez finalizado, o status da aplicação mudará para **Running** (Rodando) com um indicador verde.
4. Pronto! O seu servidor de sinalização WebRTC estará acessível publicamente através do domínio ou IP configurado.

---

## 🔄 Como Atualizar a Aplicação no Futuro?
Sempre que você fizer um novo commit ou atualizar o código no GitHub na branch principal, o Coolify detectará automaticamente e fará uma nova implantação em segundo plano sem que sua aplicação atual fique fora do ar (Zero-Downtime Deploy).
