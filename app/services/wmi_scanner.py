"""
wmi_scanner.py — Coleta dados dos PCs via SQL Server (ODBC).

Compatível com SQL Server 2008, 2012, 2014 e superiores.
Não usa WMI — toda coleta é feita via conexão ODBC já existente no sistema.

Estratégia de compatibilidade:
  - RAM: tenta physical_memory_kb (2012+), cai em physical_memory_in_bytes (2008/2005)
  - IP local: via sys.dm_exec_connections (disponível em todas as versões)
  - Versão do Windows: extraída de @@VERSION (universal)
"""

import pyodbc
import concurrent.futures
import socket
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("wmi_scanner")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# ── Query base — 100% compatível com SQL Server 2008+ ───────────────────────
# NÃO inclui physical_memory_kb (não existe no 2008) — RAM é buscada separado
SQL_PC_INFO = """
SELECT
    CAST(SERVERPROPERTY('ComputerNamePhysicalNetBIOS') AS VARCHAR(255)) AS hostname,
    CAST(SERVERPROPERTY('ProductVersion')              AS VARCHAR(50))  AS sql_version,
    CAST(SERVERPROPERTY('Edition')                     AS VARCHAR(100)) AS sql_edition,
    CAST(SERVERPROPERTY('ProductLevel')                AS VARCHAR(20))  AS sql_level,
    DATEDIFF(SECOND, sqlserver_start_time, GETDATE())                   AS uptime_seg,
    cpu_count                                                           AS cpu_nucleos,
    CAST(@@VERSION AS VARCHAR(1000))                                    AS full_version
FROM sys.dm_os_sys_info
"""

# ── RAM: SQL 2012+ usa physical_memory_kb ────────────────────────────────────
SQL_RAM_NOVO = "SELECT physical_memory_kb / 1024 FROM sys.dm_os_sys_info"

# ── RAM: SQL 2008/2005 usa physical_memory_in_bytes ──────────────────────────
SQL_RAM_LEGADO = "SELECT physical_memory_in_bytes / 1048576 FROM sys.dm_os_sys_info"

# ── IP local do servidor (via sessão SQL ativa) ───────────────────────────────
SQL_IP_LOCAL = """
SELECT TOP 1 local_net_address
FROM sys.dm_exec_connections
WHERE session_id = @@SPID
"""


def _get_lojas_conn_params():
    """Lê credenciais ODBC das lojas do .env."""
    return os.getenv("LOJAS_UID", "sa"), os.getenv("LOJAS_PWD", "sua_senha_aqui")


def _connect_target(ip: str, database: str, timeout: int = 5):
    """Abre conexão ODBC no alvo (servidor ou PDV). Retorna None se falhar."""
    uid, pwd = _get_lojas_conn_params()
    try:
        conn = pyodbc.connect(
            f"DRIVER={{SQL Server}};"
            f"SERVER={ip};"
            f"DATABASE={database};"
            f"UID={uid};"
            f"PWD={pwd};"
            f"LoginTimeout={timeout};",
            timeout=timeout
        )
        return conn
    except Exception:
        return None


def _check_port(ip: str, port: int = 1433, timeout: float = 1.5) -> bool:
    """Ping TCP rápido — evita timeouts longos em IPs offline."""
    clean_ip = ip.split("\\")[0].strip()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        result = sock.connect_ex((clean_ip, port))
        sock.close()
        return result == 0
    except Exception:
        sock.close()
        return False


def _query_ram(cursor) -> int | None:
    """
    Tenta obter a RAM total em MB.
    SQL 2012+  → physical_memory_kb  / 1024
    SQL 2008   → physical_memory_in_bytes / 1048576
    """
    # Tenta coluna nova (2012+)
    try:
        cursor.execute(SQL_RAM_NOVO)
        row = cursor.fetchone()
        if row and row[0] is not None:
            return int(row[0])
    except Exception:
        pass

    # Fallback para coluna legada (2008/2005)
    try:
        cursor.execute(SQL_RAM_LEGADO)
        row = cursor.fetchone()
        if row and row[0] is not None:
            return int(row[0])
    except Exception:
        pass

    return None


def _query_ip_local(cursor) -> str | None:
    """Obtém o IP local do servidor via sessão SQL ativa."""
    try:
        cursor.execute(SQL_IP_LOCAL)
        row = cursor.fetchone()
        if row and row[0]:
            return str(row[0]).strip()
    except Exception:
        pass
    return None


def _parse_os_version(full_ver: str) -> str:
    """Extrai a versão do Windows da string @@VERSION."""
    os_friendly = "Windows"
    if "Windows NT" in full_ver:
        try:
            nt_part = full_ver.split("Windows NT")[1].strip()
            nt_ver  = nt_part.split()[0]
            build_part = ""
            if "Build" in nt_part:
                build = nt_part.split("Build")[1].strip().split(")")[0].strip().rstrip(":")
                build_part = f" (Build {build})"
            nt_map = {
                "10.0": "Windows 10/11",
                "6.3":  "Windows 8.1 / Server 2012 R2",
                "6.2":  "Windows 8 / Server 2012",
                "6.1":  "Windows 7 / Server 2008 R2",
                "5.2":  "Windows Server 2003",
            }
            os_friendly = nt_map.get(nt_ver, f"Windows NT {nt_ver}") + build_part
        except Exception:
            pass
    return os_friendly


def scan_pc(ip: str, tipo: str, caixa_id: int | None = None) -> dict:
    """
    Coleta dados de um PC via SQL Server (2008, 2012, 2014, 2016, 2019, 2022).
    Sem WMI, sem agente, sem permissões extras — apenas a conexão ODBC existente.
    """
    base = {
        "ip":         ip,
        "tipo":       tipo,
        "caixa_id":   caixa_id,
        "hostname":    None,
        "ip_local":    None,
        "mac_address": None,
        "cpu_nucleos":  None,
        "ram_total_mb": None,
        "os_version":     None,
        "uptime_segundos": None,
        "sql_version": None,
        "sql_edition": None,
        "sql_level":   None,
        "usuario_logado": None,
        "status":            "offline",
        "ultima_atualizacao": datetime.utcnow(),
    }

    database = "LOJA" if tipo == "SERVIDOR" else "PDV"

    # Ping rápido nas portas 445 (SMB) e 1433 (SQL) — descarta IPs mortos sem travar
    clean_ip = ip.split("\\")[0].strip()
    porta_aberta = _check_port(clean_ip, 1433, 1.5) or _check_port(clean_ip, 445, 1.5)
    if not porta_aberta:
        log.info(f"[{ip}] Nenhuma porta responde → offline")
        return base

    log.info(f"[{ip}] Conectando via ODBC ({database})...")
    conn = _connect_target(ip, database, timeout=5)
    if not conn:
        log.warning(f"[{ip}] Falha na conexão ODBC")
        base["status"] = "sem_wmi"
        return base

    try:
        cursor = conn.cursor()

        # ── 1. Informações principais (100% compat. 2008+) ─────────────────
        cursor.execute(SQL_PC_INFO)
        row = cursor.fetchone()

        if not row:
            conn.close()
            base["status"] = "sem_wmi"
            return base

        hostname    = str(row[0]).strip() if row[0] else None
        sql_version = str(row[1]).strip() if row[1] else None
        sql_edition = str(row[2]).strip() if row[2] else None
        sql_level   = str(row[3]).strip() if row[3] else None
        uptime_seg  = int(row[4])         if row[4] is not None else None
        cpu_nucleos = int(row[5])         if row[5] is not None else None
        full_ver    = str(row[6]).strip() if row[6] else ""

        os_version = _parse_os_version(full_ver)

        # ── 2. RAM — com fallback automático 2008 ↔ 2012+ ─────────────────
        ram_mb = _query_ram(cursor)

        # ── 3. IP local via sessão SQL ativa ───────────────────────────────
        ip_local = _query_ip_local(cursor)

        conn.close()

        base.update({
            "hostname":    hostname,
            "ip_local":    ip_local,
            "cpu_nucleos":  cpu_nucleos,
            "ram_total_mb": ram_mb,
            "os_version":     os_version,
            "uptime_segundos": uptime_seg,
            "sql_version": sql_version,
            "sql_edition": sql_edition,
            "sql_level":   sql_level,
            "status": "online",
        })

        log.info(
            f"[{ip}] ✅ host={hostname} | RAM={ram_mb}MB | CPU={cpu_nucleos} | "
            f"SQL {sql_version} {sql_level} ({sql_edition}) | OS={os_version}"
        )
        return base

    except Exception as e:
        log.error(f"[{ip}] Erro na query SQL: {e}")
        try:
            conn.close()
        except Exception:
            pass
        base["status"] = "sem_wmi"
        return base


def scan_store_pcs(store_info: dict, loja_id: int) -> list[dict]:
    """
    Escaneia servidor + todos os PDVs de uma loja em paralelo via SQL Server.
    """
    targets = [{"ip": store_info["ip_servidor"], "tipo": "SERVIDOR", "caixa_id": None}]
    for pdv in store_info.get("pdvs", []):
        targets.append({"ip": pdv["ip"], "tipo": "PDV", "caixa_id": pdv["caixa"]})

    log.info(f"[Loja {loja_id}] Iniciando scan SQL de {len(targets)} alvos...")

    resultados = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {
            executor.submit(scan_pc, t["ip"], t["tipo"], t["caixa_id"]): t
            for t in targets
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result()
                res["loja_id"] = loja_id
                resultados.append(res)
            except Exception as e:
                log.error(f"Erro em future: {e}")

    online = sum(1 for r in resultados if r["status"] == "online")
    log.info(f"[Loja {loja_id}] Scan concluído: {online}/{len(resultados)} online")
    return resultados
