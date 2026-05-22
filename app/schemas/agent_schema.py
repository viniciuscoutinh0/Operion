from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PcStatusResponse(BaseModel):
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
    cpu_nucleos:  Optional[int] = None
    ram_total_mb: Optional[int] = None
    db_size_mb:   Optional[int] = None

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

    class Config:
        from_attributes = True


class ScanRequest(BaseModel):
    loja_id: int
