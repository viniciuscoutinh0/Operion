from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import PcStatusSnapshot
from app.schemas.agent_schema import PcStatusResponse
from app.services.worker import OdbcWorker, WorkerExecutionError
from app.services.wmi_scanner import scan_store_pcs

router = APIRouter()

# Cache em memória para evitar scans simultâneos da mesma loja
_scan_running: set = set()


def _upsert_snapshot(db: Session, data: dict):
    """
    Cria ou atualiza o snapshot de um PC na base.
    Chave única: loja_id + ip + tipo.
    """
    existing = db.query(PcStatusSnapshot).filter(
        PcStatusSnapshot.loja_id == data["loja_id"],
        PcStatusSnapshot.ip == data["ip"],
        PcStatusSnapshot.tipo == data["tipo"],
    ).first()

    if existing:
        existing.caixa_id      = data.get("caixa_id")
        # Rede
        existing.hostname      = data.get("hostname")
        existing.ip_local      = data.get("ip_local")
        existing.mac_address   = data.get("mac_address")
        # Hardware
        existing.cpu_nucleos   = data.get("cpu_nucleos")
        existing.ram_total_mb  = data.get("ram_total_mb")
        existing.db_size_mb    = data.get("db_size_mb")
        # OS
        existing.os_version    = data.get("os_version")
        existing.uptime_segundos = data.get("uptime_segundos")
        # SQL Server
        existing.sql_version   = data.get("sql_version")
        existing.sql_edition   = data.get("sql_edition")
        existing.sql_level     = data.get("sql_level")
        # Sessão
        existing.usuario_logado = data.get("usuario_logado")
        existing.status         = data.get("status", "desconhecido")
        existing.ultima_atualizacao = datetime.utcnow()
    else:
        snapshot = PcStatusSnapshot(
            loja_id=data["loja_id"],
            tipo=data["tipo"],
            ip=data["ip"],
            caixa_id=data.get("caixa_id"),
            # Rede
            hostname=data.get("hostname"),
            ip_local=data.get("ip_local"),
            mac_address=data.get("mac_address"),
            # Hardware
            cpu_nucleos=data.get("cpu_nucleos"),
            ram_total_mb=data.get("ram_total_mb"),
            db_size_mb=data.get("db_size_mb"),
            # OS
            os_version=data.get("os_version"),
            uptime_segundos=data.get("uptime_segundos"),
            # SQL Server
            sql_version=data.get("sql_version"),
            sql_edition=data.get("sql_edition"),
            sql_level=data.get("sql_level"),
            # Sessão
            usuario_logado=data.get("usuario_logado"),
            status=data.get("status", "desconhecido"),
            ultima_atualizacao=datetime.utcnow(),
        )
        db.add(snapshot)

    db.commit()


def _run_scan_background(loja_id: int):
    """
    Executa o scan WMI em background e salva os resultados no banco.
    """
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        worker = OdbcWorker()
        store_info = worker.get_store_info(loja_id)
        resultados = scan_store_pcs(store_info, loja_id)
        for res in resultados:
            _upsert_snapshot(db, res)
    except Exception as e:
        print(f"❌ [WMI SCAN] Erro no scan da loja {loja_id}: {e}")
    finally:
        db.close()
        _scan_running.discard(loja_id)


@router.post(
    "/agentes/scan/{loja_id}",
    tags=["Monitor de PCs"],
    summary="Dispara scan WMI nos PCs de uma loja",
    description=(
        "Inicia um scan WMI remoto nos PCs (servidor + PDVs) da loja informada. "
        "O scan roda em background. Use GET /agentes/{loja_id} para ver os resultados. "
        "Não instala nada nos PCs — usa WMI nativo do Windows."
    )
)
def iniciar_scan(
    loja_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if loja_id in _scan_running:
        return {"status": "em_andamento", "message": f"Scan da loja {loja_id} já está em execução."}

    _scan_running.add(loja_id)
    background_tasks.add_task(_run_scan_background, loja_id)
    return {"status": "iniciado", "message": f"Scan WMI da loja {loja_id} iniciado em background."}


@router.get(
    "/agentes/{loja_id}",
    response_model=List[PcStatusResponse],
    tags=["Monitor de PCs"],
    summary="Retorna o último status conhecido dos PCs de uma loja",
)
def status_pcs_loja(
    loja_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    snapshots = db.query(PcStatusSnapshot).filter(
        PcStatusSnapshot.loja_id == loja_id
    ).order_by(PcStatusSnapshot.tipo, PcStatusSnapshot.caixa_id).all()
    return snapshots


@router.get(
    "/agentes/",
    response_model=List[PcStatusResponse],
    tags=["Monitor de PCs"],
    summary="Retorna o último status de TODOS os PCs de todas as lojas",
)
def status_todos_pcs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    snapshots = db.query(PcStatusSnapshot).order_by(
        PcStatusSnapshot.loja_id, PcStatusSnapshot.tipo, PcStatusSnapshot.caixa_id
    ).all()
    return snapshots


@router.get(
    "/agentes/scan/{loja_id}/status",
    tags=["Monitor de PCs"],
    summary="Verifica se há scan em andamento para a loja",
)
def status_scan(
    loja_id: int,
    current_user: dict = Depends(get_current_user)
):
    em_andamento = loja_id in _scan_running
    return {"loja_id": loja_id, "scan_em_andamento": em_andamento}
