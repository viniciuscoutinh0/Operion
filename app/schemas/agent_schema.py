from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class PcStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    loja_id: int
    tipo: str
    ip: str
    caixa_id: Optional[int] = None

    # Rede
    hostname:    Optional[str] = None
    ip_local:    Optional[str] = None
    mac_address: Optional[str] = None

    # Hardware
    cpu_nucleos:    Optional[int] = None
    ram_total_mb:   Optional[int] = None
    db_size_mb:     Optional[int] = None
    db_mdf_size_mb: Optional[int] = None
    db_ldf_size_mb: Optional[int] = None
    disco_total_gb: Optional[int] = None
    disco_livre_gb: Optional[int] = None
    backup_dias_atras: Optional[int] = None

    # OS
    os_version:      Optional[str] = None
    uptime_segundos: Optional[int] = None

    # SQL Server
    sql_version: Optional[str] = None
    sql_edition: Optional[str] = None
    sql_level:   Optional[str] = None

    # Sessão
    usuario_logado: Optional[str] = None

    status: str
    ultima_atualizacao: Optional[datetime] = None

    # Integração RMM (Opcional)
    tactical_agent_id: Optional[str] = None
    tactical_remote_control_url: Optional[str] = None


class ScanRequest(BaseModel):
    loja_id: int
