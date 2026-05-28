from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.script import ScriptModel
from app.models.user import UserModel
from app.models.execution_log import ExecutionLogModel
from app.schemas.script_schema import ScriptCreate, ScriptResponse, ExecutionLogResponse
from app.core.security import get_current_user
from app.services.worker import run_script_task, run_store_scan, run_broadcast_task, ACTIVE_JOBS, OdbcWorker
from app.models.audit import AuditRuleModel
import uuid

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
#  SCRIPTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/scripts/", response_model=ScriptResponse, tags=["Admin - Scripts"])
def criar_script(script: ScriptCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if "GERENCIAR_COFRE" not in current_user.get("permissions", ""):
        raise HTTPException(status_code=403, detail="Acesso negado. Você não tem permissão para criar scripts no cofre.")
    db_script = db.query(ScriptModel).filter(ScriptModel.nome == script.nome).first()
    if db_script:
        raise HTTPException(status_code=400, detail="Script com este nome já existe.")

    novo_script = ScriptModel(**script.model_dump())
    novo_script.criado_por = current_user.get("email", "desconhecido")
    db.add(novo_script)
    db.commit()
    db.refresh(novo_script)
    return novo_script


@router.get("/scripts/", response_model=List[ScriptResponse], tags=["Usuários e Admin - Scripts"])
def listar_scripts(apenas_publicados: bool = False, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user = db.query(UserModel).filter(UserModel.id == current_user["id"]).first()

    if "GERENCIAR_COFRE" in current_user.get("permissions", ""):
        query = db.query(ScriptModel)
        if apenas_publicados:
            query = query.filter(ScriptModel.publicado == True)
        return query.all()
    else:
        if user and user.scripts_permitidos:
            scripts_permitidos_ids = [s.id for s in user.scripts_permitidos]
            return db.query(ScriptModel).filter(
                ScriptModel.id.in_(scripts_permitidos_ids),
                ScriptModel.publicado == True
            ).all()
        return []


@router.get("/scripts/{script_id}", response_model=ScriptResponse, tags=["Usuários e Admin - Scripts"])
def buscar_script(script_id: int, db: Session = Depends(get_db)):
    script = db.query(ScriptModel).filter(ScriptModel.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script não encontrado")
    return script


@router.put("/scripts/{script_id}", response_model=ScriptResponse, tags=["Admin - Scripts"])
def atualizar_script(script_id: int, req: ScriptCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if "GERENCIAR_COFRE" not in current_user.get("permissions", ""):
        raise HTTPException(status_code=403, detail="Acesso negado. Você não tem permissão para editar scripts.")

    script = db.query(ScriptModel).filter(ScriptModel.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script não encontrado")

    script.nome                = req.nome
    script.descricao           = req.descricao
    script.sql_servidor        = req.sql_servidor
    script.sql_pdv             = req.sql_pdv
    script.parametros_exigidos = req.parametros_exigidos
    script.publicado           = req.publicado
    script.alvo_fixo           = req.alvo_fixo  # Salva o alvo travado
    script.modificado_por      = current_user.get("email", "desconhecido")
    if not script.criado_por:
        script.criado_por      = current_user.get("email", "desconhecido")

    db.commit()
    db.refresh(script)
    return script


@router.delete("/scripts/{script_id}", tags=["Admin - Scripts"])
def deletar_script(script_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if "GERENCIAR_COFRE" not in current_user.get("permissions", ""):
        raise HTTPException(status_code=403, detail="Acesso negado. Você não tem permissão para deletar scripts.")

    script = db.query(ScriptModel).filter(ScriptModel.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script não encontrado")

    db.delete(script)
    db.commit()
    return {"message": "Script deletado com sucesso"}


# ══════════════════════════════════════════════════════════════════════════════
#  LOJAS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/lojas/", tags=["Dashboard e Lojas"])
def listar_lojas(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        worker = OdbcWorker()
        conn = worker.connect_retaguarda()
        cursor = conn.cursor()
        query = """
        SELECT L.LOJA, L.NOME_RESUMIDO, P.INSCRICAO_FEDERAL
        FROM LOJAS L WITH(NOLOCK)
        LEFT JOIN PESSOAS_JURIDICAS P WITH(NOLOCK) ON P.ENTIDADE = L.LOJA
        WHERE L.ATIVA = 'S' AND L.LOJA NOT IN (990, 900)
        ORDER BY L.LOJA
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        lojas = [{"id": int(r[0]), "nome": r[1], "cnpj": str(r[2]).strip() if r[2] else "N/D"} for r in rows]
        return lojas
    except Exception as e:
        print(f"Erro ao buscar lojas: {e}")
        return []


@router.get("/lojas/{loja_id}/status", tags=["Dashboard e Monitor"])
def status_loja(loja_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if loja_id in (990, 900):
        raise HTTPException(status_code=400, detail="Acesso restrito para esta loja.")
    try:
        regras = db.query(AuditRuleModel).all()
        resultado = run_store_scan(loja_id, regras)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  EXECUÇÕES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/execucoes/", tags=["Execução ODBC"])
def executar_script(
    req: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    script_id  = req.get("script_id")
    loja_id    = req.get("loja_id")
    parametros = req.get("parametros", {})

    try:
        if int(loja_id) in (990, 900):
            raise HTTPException(status_code=400, detail="Operações nas lojas 990 e 900 são restritas por segurança.")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Identificador de loja inválido.")

    script = db.query(ScriptModel).filter(ScriptModel.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script não encontrado no Cofre")

    # Validação de Segurança
    if "EXECUTAR_SCRIPT" not in current_user.get("permissions", ""):
        raise HTTPException(status_code=403, detail="Acesso negado. Você não tem permissão para executar scripts.")

    if "GERENCIAR_COFRE" not in current_user.get("permissions", ""):
        user = db.query(UserModel).filter(UserModel.id == current_user["id"]).first()
        scripts_permitidos = [s.id for s in user.scripts_permitidos]
        if script_id not in scripts_permitidos:
            raise HTTPException(status_code=403, detail="Você não tem permissão para rodar este script")

    # ── Alvo: script.alvo_fixo prevalece sobre o que o frontend enviou ──────
    # Isso impede que o usuário force a execução em todos os caixas
    # quando o script foi configurado para rodar em apenas um.
    alvo = script.alvo_fixo if script.alvo_fixo else req.get("alvo", "AMBOS")

    job_id = str(uuid.uuid4())

    # ── Log de segurança — registra QUEM executou, ONDE e COM QUE PARÂMETROS ─
    log = ExecutionLogModel(
        script_id     = script.id,
        script_nome   = script.nome,
        usuario_id    = current_user["id"],
        usuario_email = current_user.get("email", "desconhecido"),
        usuario_role  = current_user.get("role", ""),
        loja_id       = str(loja_id),
        alvo          = alvo,
        parametros    = parametros,
        job_id        = job_id,
        status_final  = "pendente",
    )
    db.add(log)
    db.commit()

    print(f"📋 [LOG #{log.id}] '{log.usuario_email}' ({log.usuario_role}) → '{script.nome}' | Loja {loja_id} | Alvo: {alvo} | Params: {parametros}")

    # Inicia the Worker em Background
    background_tasks.add_task(
        run_script_task,
        job_id      = job_id,
        script_nome = script.nome,
        sql_servidor= script.sql_servidor,
        sql_pdv     = script.sql_pdv,
        loja_id     = loja_id,
        alvo        = alvo,
        parametros  = parametros,
        log_id      = log.id   # ← passa o ID para atualizar o status ao finalizar
    )

    return {"status": "sucesso", "job_id": job_id, "message": "Script enviado para a fila."}


@router.post("/broadcast/", tags=["Execução ODBC"])
def executar_broadcast(
    req: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if "EXECUTAR_BROADCAST" not in current_user.get("permissions", ""):
        raise HTTPException(status_code=403, detail="Acesso negado. Você não tem permissão para disparar broadcast.")
    
    script_id = req.get("script_id")
    script = db.query(ScriptModel).filter(ScriptModel.id == script_id).first()
    if not script:
        raise HTTPException(status_code=404, detail="Script não encontrado")
    
    # 1. Busca todas as lojas ativas na Retaguarda para saber onde aplicar (excluindo 990 e 900)
    try:
        worker = OdbcWorker()
        conn = worker.connect_retaguarda()
        cursor = conn.cursor()
        query = """
        SELECT L.LOJA, L.NOME_RESUMIDO
        FROM LOJAS L WITH(NOLOCK)
        WHERE L.ATIVA = 'S' AND L.LOJA NOT IN (990, 900)
        ORDER BY L.LOJA
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        lojas = [{"id": int(r[0]), "nome": r[1]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar lojas da Retaguarda para broadcast: {e}")

    if not lojas:
        raise HTTPException(status_code=400, detail="Nenhuma loja ativa encontrada para executar o broadcast")

    # 2. Aplica filtros flexíveis de lojas selecionadas
    tipo_selecao = req.get("tipo_selecao", "TODAS")
    loja_log_id = "TODAS"

    if tipo_selecao == "INTERVALO":
        try:
            de = int(req.get("loja_de", 0))
            ate = int(req.get("loja_ate", 9999))
            lojas = [l for l in lojas if de <= l["id"] <= ate]
            loja_log_id = f"LOJAS {de} ATÉ {ate}"
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Valores de intervalo 'de' e 'até' inválidos.")

    elif tipo_selecao == "LISTA":
        ids_brutos = req.get("lojas_ids", "")
        ids_filtrados = []
        if isinstance(ids_brutos, str):
            try:
                # Trata string separada por vírgulas, ex: "50,60,70"
                for item in ids_brutos.split(","):
                    clean_item = item.strip()
                    if clean_item.isdigit():
                        ids_filtrados.append(int(clean_item))
            except Exception:
                raise HTTPException(status_code=400, detail="Formato de lista de lojas inválido. Ex: 50, 60, 70")
        elif isinstance(ids_brutos, list):
            ids_filtrados = [int(x) for x in ids_brutos if str(x).strip().isdigit()]

        if not ids_filtrados:
            raise HTTPException(status_code=400, detail="Nenhuma loja válida fornecida na lista de IDs.")

        lojas = [l for l in lojas if l["id"] in ids_filtrados]
        loja_log_id = f"LOJAS: {', '.join(str(x) for x in ids_filtrados)}"

    # Garante duplamente que nenhuma loja restrita passe por filtros de intervalo ou lista manual
    lojas = [l for l in lojas if l["id"] not in (990, 900)]

    if not lojas:
        raise HTTPException(status_code=400, detail="Nenhuma loja ativa correspondeu ao critério de filtro selecionado.")

    parametros = req.get("parametros", {})
    alvo = script.alvo_fixo if script.alvo_fixo else req.get("alvo", "AMBOS")
    if alvo == "PDV_ESPECIFICO":
        alvo = "TODOS_PDVS"  # No broadcast rodamos em todos os caixas, não faz sentido fixar um caixa específico sem input global

    job_id = str(uuid.uuid4())

    # 3. Cria o log de execução consolidado do Broadcast
    log = ExecutionLogModel(
        script_id     = script.id,
        script_nome   = script.nome,
        usuario_id    = current_user["id"],
        usuario_email = current_user.get("email", "desconhecido"),
        usuario_role  = current_user.get("role", ""),
        loja_id       = loja_log_id,
        alvo          = alvo,
        parametros    = parametros,
        job_id        = job_id,
        status_final  = "pendente",
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    print(f"🌍 [BROADCAST LOG #{log.id}] '{log.usuario_email}' → '{script.nome}' em {loja_log_id} ({len(lojas)} lojas) | Alvo: {alvo} | Job ID: {job_id}")

    # 4. Dispara a task de broadcast
    background_tasks.add_task(
        run_broadcast_task,
        job_id      = job_id,
        script_nome = script.nome,
        sql_servidor= script.sql_servidor,
        sql_pdv     = script.sql_pdv,
        alvo        = alvo,
        parametros  = parametros,
        lojas       = lojas,
        log_id      = log.id
    )

    return {"status": "sucesso", "job_id": job_id, "message": "Broadcast de script enviado para a fila."}



@router.get("/execucoes/logs/", response_model=List[ExecutionLogResponse], tags=["Admin - Logs"])
def listar_logs_execucao(
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Histórico completo de quem executou qual script, quando e em qual loja.
    ⚠️ Acesso restrito.
    """
    if "VER_LOGS" not in current_user.get("permissions", ""):
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Você não tem permissão para visualizar os logs de execução."
        )

    logs = (
        db.query(ExecutionLogModel)
        .order_by(ExecutionLogModel.id.desc())
        .limit(limit)
        .all()
    )
    return logs


@router.get("/execucoes/{job_id}/status", tags=["Execução ODBC"])
def status_execucao(job_id: str):
    if job_id not in ACTIVE_JOBS:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return ACTIVE_JOBS[job_id]
