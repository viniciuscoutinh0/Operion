from sqlalchemy import Column, Integer, String, DateTime, BigInteger
from datetime import datetime
from app.core.database import Base


class PcStatusSnapshot(Base):
    """
    Armazena o último snapshot de status de cada PC (Servidor ou PDV) de cada loja.
    Atualizado a cada vez que o scan é executado via ODBC/SQL Server.
    """
    __tablename__ = "pc_status_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    # Identificação
    loja_id    = Column(Integer, index=True, nullable=False)
    tipo       = Column(String(20), nullable=False)        # "SERVIDOR" ou "PDV"
    ip         = Column(String(50), nullable=False, index=True)
    caixa_id   = Column(Integer, nullable=True)            # Número do caixa (apenas PDVs)

    # ── Rede ──────────────────────────────────────────────────────
    hostname    = Column(String(255), nullable=True)
    ip_local    = Column(String(50), nullable=True)        # IP detectado pelo SQL Server
    mac_address = Column(String(50), nullable=True)

    # ── Hardware ──────────────────────────────────────────────────
    cpu_nucleos  = Column(Integer, nullable=True)          # Quantidade de CPUs lógicas
    ram_total_mb = Column(BigInteger, nullable=True)       # RAM total em MB
    db_size_mb   = Column(BigInteger, nullable=True)       # Tamanho do banco em MB

    # ── Sistema Operacional ───────────────────────────────────────
    os_version       = Column(String(255), nullable=True)
    uptime_segundos  = Column(Integer, nullable=True)

    # ── SQL Server ────────────────────────────────────────────────
    sql_version  = Column(String(50), nullable=True)       # ex: "15.0.2000.5"
    sql_edition  = Column(String(100), nullable=True)      # ex: "Express Edition"
    sql_level    = Column(String(20), nullable=True)       # ex: "RTM", "SP1", "CU14"

    # ── Sessão ────────────────────────────────────────────────────
    usuario_logado = Column(String(255), nullable=True)

    # ── Status ───────────────────────────────────────────────────
    status            = Column(String(20), default="desconhecido")  # online | offline | sem_wmi
    ultima_atualizacao = Column(DateTime, default=datetime.utcnow)
