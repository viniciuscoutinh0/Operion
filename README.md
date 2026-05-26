# Argus

[![CI — Testes Automatizados](https://github.com/felipe-delf/Argus/actions/workflows/ci.yml/badge.svg)](https://github.com/felipe-delf/Argus/actions/workflows/ci.yml)

**Argus** é uma plataforma open-source de parametrização, auditoria e monitoramento para redes de varejo. Permite executar scripts SQL remotos em Servidores e PDVs das lojas, com controle granular de acesso (RBAC), dashboard em tempo real e auditoria de execuções.

## ✨ Funcionalidades

- 🔒 **Autenticação JWT** com controle de acesso por grupos (RBAC dinâmico)
- 🗃️ **Cofre SQL** — crie, versione e publique scripts para as lojas
- 🖥️ **Monitor de Lojas** — veja CPU, RAM, Disco e versão SQL em tempo real via ODBC
- 📋 **Auditoria** — defina regras SQL para validar a saúde dos PDVs
- 📡 **Broadcast** — dispare scripts em múltiplas lojas simultaneamente
- 👥 **Gerenciamento de Equipe** — grupos com permissões customizadas (N1, N2, Desenvolvimento, etc.)
- 📊 **Logs de Execução** — histórico completo de todos os disparos

## 🛠️ Tecnologias

| Camada | Stack |
|---|---|
| Backend | FastAPI, SQLAlchemy, PyODBC (SQL Server), PyJWT |
| Frontend | React 19, Vite, React Router |
| Banco local | SQLite (usuários, grupos, regras, scripts) |
| Infra | Docker, Docker Compose, GitHub Actions (CI) |
| Testes | Pytest, TestClient (FastAPI) |

## 🚀 Como Rodar

### Pré-requisitos

- Docker e Docker Compose **ou** Python 3.11+ e Node.js 20+
- Acesso de rede à porta **1433** dos Servidores/PDVs das lojas (SQL Server)
- Microsoft ODBC Driver 18 for SQL Server (instalado automaticamente no Docker)

### 1. Configurar as variáveis de ambiente

Copie o arquivo de exemplo e edite com suas credenciais:

```bash
cp .env.example .env
```

Edite o `.env`:

```env
# JWT & Segurança
SECRET_KEY=sua_secret_key_aleatoria_aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=600

# Banco de Dados Local
DATABASE_URL=sqlite:///./parametrizacao.db

# Retaguarda (banco central da sua rede)
RETAGUARDA_IP=IP_DO_SERVIDOR_RETAGUARDA
RETAGUARDA_DB=NOME_DO_BANCO_RETAGUARDA
RETAGUARDA_USER=usuario_sql
RETAGUARDA_PWD=senha_sql

# Lojas (PDVs e Servidores)
LOJAS_UID=SA
LOJAS_PWD=sua_senha_lojas
```

### 2. Rodar com Docker (Recomendado para Produção)

```bash
docker-compose up -d --build
```

| Serviço | URL |
|---|---|
| Frontend | http://localhost:80 |
| Backend API | http://localhost:8080/docs |

### 3. Rodar Localmente (Desenvolvimento)

**Backend:**
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

**Frontend** (em outro terminal):
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## 🔐 Primeiro Acesso

Ao iniciar pela primeira vez, o sistema cria automaticamente um usuário administrador padrão:

- **E-mail:** `admin@empresa.com`
- **Senha:** `Admin@123`

> ⚠️ **Troque imediatamente** a senha após o primeiro login!

## 🧪 Testes Automatizados

```bash
pip install -r requirements-test.txt
python -m pytest tests/ -v
```

O CI/CD via GitHub Actions executa os testes a cada `push` ou `pull_request` para as branches `main`, `master` ou `develop`.

## 📁 Estrutura do Projeto

```
├── app/
│   ├── api/          # Rotas FastAPI (auth, users, scripts, audit, agent)
│   ├── core/         # Segurança JWT, banco de dados, configurações
│   ├── models/       # Models SQLAlchemy
│   ├── schemas/      # Schemas Pydantic V2
│   └── services/     # Workers de execução ODBC e scan WMI
├── frontend/
│   └── src/
│       └── components/  # Componentes React
├── tests/            # Suite de testes Pytest (47 testes)
├── .github/
│   └── workflows/    # Pipeline CI/CD GitHub Actions
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 📄 Licença

MIT License — veja [LICENSE](LICENSE) para detalhes.
