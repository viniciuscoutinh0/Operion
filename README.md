# PromoSync

PromoSync é uma plataforma de parametrização e auditoria para Servidores e PDVs de lojas. Ele permite executar scripts remotos automatizados em bancos de dados SQL Server locais de forma rápida, além de contar com um painel (dashboard) com regras avançadas de validação e métricas gerais.

## Tecnologias

- **Backend:** FastAPI, SQLAlchemy, PyODBC (SQL Server / MS ODBC 18).
- **Frontend:** React, Vite.
- **Banco Local:** SQLite (para manter os usuários, regras de auditoria e configurações).

## Requisitos

- Docker e Docker Compose instalados na máquina servidora.
- Acesso à rede das Lojas (Porta 1433 liberada nos PDVs/Servidores para conexão com o banco).

## Configuração

Antes de rodar a aplicação, crie um arquivo `.env` na raiz do projeto (onde o arquivo `main.py` está localizado).

Exemplo de estrutura do `.env`:

```env
# 1. JWT & Segurança da API
SECRET_KEY=SUA_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=600

# 2. Banco de Dados Local do Backend (FastAPI)
DATABASE_URL=sqlite:///./parametrizacao.db

# 3. Credenciais da Retaguarda
RETAGUARDA_IP=SERVIDOR
RETAGUARDA_DB=RETAGUARDA_PRODUCAO
RETAGUARDA_USER=usuario_aqui
RETAGUARDA_PWD=senha_aqui

# 4. Credenciais das Lojas (Servidores e PDVs - ODBC)
LOJAS_UID=USUARIO
LOJAS_PWD=SENHA
```

> **Atenção:** Se não tiver o arquivo `parametrizacao.db`, o FastAPI vai criá-lo automaticamente ao rodar, porém vazio (sem usuário). Você precisará criá-lo via script ou via API.

## Como Rodar via Docker (Recomendado para Produção)

A aplicação conta com um arquivo `docker-compose.yml` e dois `Dockerfile` (um para o backend em Python, e outro para o frontend em Nginx). O Dockerfile do Backend já cuida da instalação do driver da Microsoft (`msodbcsql18`), que é necessário para a conexão ODBC.

Na raiz do projeto, execute:

```bash
docker-compose up -d --build
```

- **Frontend:** Acessível em `http://localhost:80`
- **Backend (API):** Acessível em `http://localhost:8080/docs`

## Como Rodar Localmente (Desenvolvimento)

Se preferir não usar o Docker para testes locais, você precisará ter o MS ODBC Driver 18 for SQL Server ou a versão 11 instalada no seu Windows/Linux.

### Backend

```bash
# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor
uvicorn app.main:app --reload --port 8080
```

### Frontend

Em um terminal separado:

```bash
cd frontend
npm install
npm run dev
```

A interface web estará disponível em `http://localhost:5173`.
