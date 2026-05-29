import os
from dotenv import load_dotenv

# Carrega as variáveis de ambiente antes de tudo
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import create_tables, SessionLocal
from app.core.security import get_password_hash

from app.models.user import UserModel
from app.models.user_group import UserGroupModel # Garante criação da tabela de grupos
from app.models.audit import AuditRuleModel, AuditGroupModel  # Garante criação das tabelas audit_rules e audit_groups
from app.models.agent import PcStatusSnapshot  # Garante que a tabela seja criada
from app.models.execution_log import ExecutionLogModel  # Garante criação da tabela de logs de execução

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.audit import router as audit_router
from app.api.agent import router as agent_router
from app.api.routes import router as scripts_router

# Cria todas as tabelas no SQLite ao iniciar
create_tables()

# Popula banco e garante pelo menos um administrador ativo (Failsafe Auto-Recovery)
db = SessionLocal()
try:
    # ── 1. Semente de Grupos de Permissões Nativos com Hierarquia ───────────────
    # Grupo Administradores (Raiz)
    administradores = db.query(UserGroupModel).filter(UserGroupModel.nome == "Administradores").first()
    if not administradores:
        print("[SEED] Criando grupo de controle total: Administradores...")
        administradores = UserGroupModel(
            nome="Administradores",
            descricao="Administração total da TI, infraestrutura, acessos e execução de scripts",
            permissoes="VER_DASHBOARD,EXECUTAR_SCRIPT,GERENCIAR_COFRE,GERENCIAR_AUDITORIA,VER_LOGS,EXECUTAR_BROADCAST,GERENCIAR_EQUIPE",
            parent_id=None
        )
        db.add(administradores)
        db.commit()
        db.refresh(administradores)

    # 1. Promofarma (Raiz)
    promofarma = db.query(UserGroupModel).filter(UserGroupModel.nome == "Promofarma").first()
    if not promofarma:
        print("[SEED] Criando nó raiz: Promofarma...")
        promofarma = UserGroupModel(
            nome="Promofarma",
            descricao="Organização Farmacêutica Nakano / Promofarma (Raiz Corporativa)",
            permissoes="VER_DASHBOARD"
        )
        db.add(promofarma)
        db.commit()
        db.refresh(promofarma)

    # 2. TI (Pai: Promofarma)
    ti = db.query(UserGroupModel).filter(UserGroupModel.nome == "TI").first()
    if not ti:
        print("[SEED] Criando departamento: TI...")
        ti = UserGroupModel(
            nome="TI",
            descricao="Diretoria de Tecnologia, Sistemas e Segurança",
            permissoes="VER_DASHBOARD,GERENCIAR_EQUIPE,VER_LOGS",
            parent_id=promofarma.id
        )
        db.add(ti)
        db.commit()
        db.refresh(ti)
    elif ti.parent_id != promofarma.id:
        ti.parent_id = promofarma.id
        db.commit()

    # 3. Desenvolvimento (Pai: TI)
    desenvolvimento = db.query(UserGroupModel).filter(UserGroupModel.nome == "Desenvolvimento").first()
    if not desenvolvimento:
        # Se existir "Desenvedor" ou "Desenvolvedor" legado, podemos migrar
        desenv_legado = db.query(UserGroupModel).filter(UserGroupModel.nome.in_(["Desenvolvedor", "Desenvolvedor"])).first()
        if desenv_legado:
            desenv_legado.nome = "Desenvolvimento"
            desenv_legado.descricao = "Engenharia de Software e homologação de scripts SQL"
            desenv_legado.parent_id = ti.id
            db.commit()
            desenvolvimento = desenv_legado
        else:
            print("[SEED] Criando time: Desenvolvimento...")
            desenvolvimento = UserGroupModel(
                nome="Desenvolvimento",
                descricao="Engenharia de Software e homologação de scripts SQL",
                permissoes="VER_DASHBOARD,GERENCIAR_COFRE,VER_LOGS,EXECUTAR_SCRIPT",
                parent_id=ti.id
            )
            db.add(desenvolvimento)
            db.commit()
            db.refresh(desenvolvimento)
    elif desenvolvimento.parent_id != ti.id:
        desenvolvimento.parent_id = ti.id
        db.commit()

    # 4. Infraestrutura (Pai: TI)
    infra = db.query(UserGroupModel).filter(UserGroupModel.nome == "Infraestrutura").first()
    if not infra:
        print("[SEED] Criando time: Infraestrutura...")
        infra = UserGroupModel(
            nome="Infraestrutura",
            descricao="Gestão de servidores, bancos de dados e conectividade",
            permissoes="VER_DASHBOARD,EXECUTAR_BROADCAST,VER_LOGS",
            parent_id=ti.id
        )
        db.add(infra)
        db.commit()
        db.refresh(infra)
    elif infra.parent_id != ti.id:
        infra.parent_id = ti.id
        db.commit()

    # 5. Suporte (Pai: TI)
    suporte = db.query(UserGroupModel).filter(UserGroupModel.nome == "Suporte").first()
    if not suporte:
        print("[SEED] Criando time: Suporte...")
        suporte = UserGroupModel(
            nome="Suporte",
            descricao="Central de Serviços e atendimento a lojas",
            permissoes="VER_DASHBOARD,EXECUTAR_SCRIPT,VER_LOGS",
            parent_id=ti.id
        )
        db.add(suporte)
        db.commit()
        db.refresh(suporte)
    elif suporte.parent_id != ti.id:
        suporte.parent_id = ti.id
        db.commit()

    # 6. Suporte N2 (Pai: Suporte)
    suporte_n2 = db.query(UserGroupModel).filter(UserGroupModel.nome == "Suporte N2").first()
    if not suporte_n2:
        print("[SEED] Criando cargo: Suporte N2...")
        suporte_n2 = UserGroupModel(
            nome="Suporte N2",
            descricao="Suporte avançado e gestão de auditoria de lojas",
            permissoes="VER_DASHBOARD,EXECUTAR_SCRIPT,VER_LOGS,GERENCIAR_AUDITORIA",
            parent_id=suporte.id
        )
        db.add(suporte_n2)
        db.commit()
        db.refresh(suporte_n2)
    elif suporte_n2.parent_id != suporte.id:
        suporte_n2.parent_id = suporte.id
        db.commit()

    # 7. Suporte N1 (Pai: Suporte)
    suporte_n1 = db.query(UserGroupModel).filter(UserGroupModel.nome == "Suporte N1").first()
    if not suporte_n1:
        print("[SEED] Criando cargo: Suporte N1...")
        suporte_n1 = UserGroupModel(
            nome="Suporte N1",
            descricao="Monitoramento básico e suporte operacional de lojas",
            permissoes="VER_DASHBOARD",
            parent_id=suporte.id
        )
        db.add(suporte_n1)
        db.commit()
        db.refresh(suporte_n1)
    elif suporte_n1.parent_id != suporte.id:
        suporte_n1.parent_id = suporte.id
        db.commit()

    # Busca o grupo de TI para usar no failsafe
    grupo_ti = db.query(UserGroupModel).filter(UserGroupModel.nome == "Administradores").first()
    grupo_ti_id = grupo_ti.id if grupo_ti else None

    grupo_n2 = db.query(UserGroupModel).filter(UserGroupModel.nome == "Suporte N2").first()
    grupo_n2_id = grupo_n2.id if grupo_n2 else None

    # Migração automática de legado: Vincula todos os usuários antigos sem grupo_id aos novos grupos
    usuarios_sem_grupo = db.query(UserModel).filter(UserModel.grupo_id == None).all()
    if usuarios_sem_grupo:
        print(f"[SEED] [MIGRAÇÃO] Vinculando {len(usuarios_sem_grupo)} usuários sem grupo aos grupos dinâmicos...")
        for u in usuarios_sem_grupo:
            if u.role == "Admin":
                u.grupo_id = grupo_ti_id
            else:
                u.grupo_id = grupo_n2_id
        db.commit()

    # Verificação de segurança: há algum administrador ativo no sistema?
    admin_ativo = db.query(UserModel).filter(
        UserModel.role == "Admin",
        UserModel.ativo == True
    ).first()


    if not admin_ativo:
        print("[AVISO] [ADMIN FAILSAFE] Nenhum administrador ativo encontrado no banco! Criando/Reativando o super admin padrão...")
        admin_padrao = db.query(UserModel).filter(UserModel.email == "admin@empresa.com").first()
        if admin_padrao:
            # Reativa e reseta as credenciais do admin padrão
            admin_padrao.role = "Admin"
            admin_padrao.grupo_id = grupo_ti_id
            admin_padrao.ativo = True
            admin_padrao.senha_hash = get_password_hash("Admin@123")
            admin_padrao.exige_troca_senha = False
            print("[AVISO] [ADMIN FAILSAFE] Administrador padrão 'admin@empresa.com' reativado com a senha padrão 'Admin@123' e grupo Administradores.")
        else:
            # Cria o admin padrão do zero
            admin_padrao = UserModel(
                email="admin@empresa.com",
                senha_hash=get_password_hash("Admin@123"),
                role="Admin",
                grupo_id=grupo_ti_id,
                ativo=True,
                exige_troca_senha=False
            )
            db.add(admin_padrao)
            print("[AVISO] [ADMIN FAILSAFE] Administrador padrão 'admin@empresa.com' criado do zero com a senha padrão 'Admin@123' e grupo Administradores.")
        db.commit()

except Exception as e:
    print(f"[ERRO] [ADMIN FAILSAFE] Falha ao executar o failsafe de administrador: {e}")
    db.rollback()
finally:
    db.close()

app = FastAPI(
    title="Operion API",
    description="API para o Gerenciador de Automações, Parametrizações e Monitor de Lojas",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,    prefix="/api/auth")
app.include_router(users_router,   prefix="/api/usuarios")
app.include_router(audit_router,   prefix="/api")
app.include_router(agent_router,   prefix="/api")
app.include_router(scripts_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "API Operion v2.0 Online. Acesse /docs para a documentação interativa."}
