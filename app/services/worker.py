import pyodbc
import concurrent.futures
import time
import socket
import re

ACTIVE_JOBS = {}

class WorkerExecutionError(Exception):
    pass


def _build_connection_string(server, db, uid, pwd, timeout=None) -> str:
    drivers = pyodbc.drivers()
    if "ODBC Driver 18 for SQL Server" in drivers:
        driver = "ODBC Driver 18 for SQL Server"
        trust = "TrustServerCertificate=yes;"
    elif "ODBC Driver 17 for SQL Server" in drivers:
        driver = "ODBC Driver 17 for SQL Server"
        trust = ""
    elif "SQL Server Native Client 11.0" in drivers:
        driver = "SQL Server Native Client 11.0"
        trust = ""
    else:
        driver = "SQL Server"
        trust = ""
        
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={db};"
        f"UID={uid};"
        f"PWD={pwd};"
        f"{trust}"
    )
    if timeout is not None:
        conn_str += f"LoginTimeout={timeout};"
    return conn_str


def _is_reachable(ip_com_instancia: str, timeout_seg: float = 3.0) -> bool:
    """
    Faz um TCP ping na porta 1433 do host.
    Retorna True se a porta estiver acessível, False caso contrário.
    Usa apenas o IP/hostname (remove \\INSTANCIA antes de testar).
    Timeout padrão de 3 segundos para não travar a execução.
    """
    host = ip_com_instancia.split('\\')[0].strip()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout_seg)
    try:
        resultado = sock.connect_ex((host, 1433))
        return resultado == 0
    except Exception:
        return False
    finally:
        sock.close()

class OdbcWorker:
    def __init__(self):
        import os
        self.retaguarda_ip = os.getenv('RETAGUARDA_IP', '127.0.0.1')
        self.retaguarda_db = os.getenv('RETAGUARDA_DB', 'RETAGUARDA')
        self.user = os.getenv('RETAGUARDA_USER', 'sa')
        self.password = os.getenv('RETAGUARDA_PWD', 'SenhaForteAqui')
        
        self.lojas_uid = os.getenv('LOJAS_UID', 'sa')
        self.lojas_pwd = os.getenv('LOJAS_PWD', 'SenhaForteAqui')

    def connect_retaguarda(self):
        try:
            conn_str = _build_connection_string(
                self.retaguarda_ip,
                self.retaguarda_db,
                self.user,
                self.password,
                timeout=5
            )
            return pyodbc.connect(conn_str, timeout=5)
        except Exception as e:
            print(f"[ERRO] [WORKER] Erro ao conectar na Retaguarda: {e}")
            raise WorkerExecutionError(f"Falha de conexão com a Retaguarda: {e}")

    def get_store_info(self, loja_id):
        print(f"[BUSCA] [WORKER] Buscando dados da loja {loja_id} na Retaguarda...")
        conn = self.connect_retaguarda()
        cursor = conn.cursor()
        
        # Busca o IP do Servidor da Loja
        cursor.execute(f"SELECT IP_SERVIDOR_LOJA FROM LOJAS WHERE LOJA = {loja_id}")
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise WorkerExecutionError(f"Loja {loja_id} não encontrada na Retaguarda.")
            
        ip_servidor = row[0]
        
        # Busca os PDVs atrelados à Loja
        cursor.execute(f"SELECT B.CAIXA, B.IP FROM LOJAS A INNER JOIN LOJAS_PDV B ON B.REGISTRO = A.REGISTRO WHERE A.LOJA = {loja_id}")
        pdvs = [{"caixa": int(r[0]), "ip": r[1]} for r in cursor.fetchall()]
        
        conn.close()
        print(f"[OK] [WORKER] Dados da loja {loja_id} encontrados. Servidor: {ip_servidor}, PDVs: {len(pdvs)}")
        return {"ip_servidor": ip_servidor, "pdvs": pdvs}

    def execute_sql(self, ip_alvo, base, sql, timeout=10):
        """
        Executa um script SQL no alvo especificado.

        Fluxo:
          1. TCP ping rápido (3s) na porta 1433 — se offline, aborta imediatamente
          2. Pré-processa o SQL (remove GO e USE)
          3. Executa via ODBC com LoginTimeout=5s
        """
        # ─ 1. Verifica se a máquina está online antes de tentar ODBC ──────────────
        print(f"[TESTE] [WORKER] Verificando conexão com {ip_alvo}...")
        if not _is_reachable(ip_alvo, timeout_seg=3.0):
            msg = f"Máquina offline ou porta 1433 fechada: {ip_alvo}"
            print(f"[ERRO] [WORKER] {msg}")
            raise WorkerExecutionError(msg)

        # ─ 2. Pré-processa o SQL (remove GO e USE <banco>) ─────────────────
        sql_clean = re.sub(r'^\s*GO\s*$', '', sql, flags=re.IGNORECASE | re.MULTILINE)
        sql_clean = re.sub(r'^\s*USE\s+\S+\s*;?\s*$', '', sql_clean, flags=re.IGNORECASE | re.MULTILINE)
        sql_clean = '\n'.join(line for line in sql_clean.splitlines() if line.strip())
        print(f"[SQL] [WORKER] Conectando no banco '{base}' | SQL: {len(sql_clean)} chars")

        # ─ 3. Executa via ODBC ────────────────────────────────────────
        odbc_timeout = 5  # segundos — Login + query timeout via pyodbc

        def _connect_and_run():
            conn_str = _build_connection_string(
                ip_alvo,
                base,
                self.lojas_uid,
                self.lojas_pwd,
                timeout=odbc_timeout
            )
            conn_str += f"QueryTimeout={odbc_timeout};"
            conn = pyodbc.connect(conn_str, timeout=odbc_timeout)
            cursor = conn.cursor()
            try:
                cursor.execute(sql_clean)
                conn.commit()
                print(f"[OK] [WORKER] Script executado com sucesso em {ip_alvo}")
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_connect_and_run)
        try:
            future.result(timeout=odbc_timeout + 5)  # Margem de segurança
        except concurrent.futures.TimeoutError:
            msg = f"Timeout ({odbc_timeout}s) ao executar em {ip_alvo}"
            print(f"[ERRO] [WORKER] {msg}")
            raise WorkerExecutionError(msg)
        except Exception as e:
            print(f"[ERRO] [WORKER] Erro SQL em {ip_alvo}: {e}")
            raise WorkerExecutionError(str(e))


    def execute_query(self, ip_alvo, base, sql, timeout=3):
        def _connect_and_run():
            conn_str = _build_connection_string(
                ip_alvo,
                base,
                self.lojas_uid,
                self.lojas_pwd,
                timeout=timeout
            )
            conn = pyodbc.connect(conn_str, timeout=timeout)
            cursor = conn.cursor()
            cursor.execute(sql)
            row = cursor.fetchone()
            conn.close()
            return str(row[0]) if row else ""
            
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_connect_and_run)
        try:
            return future.result(timeout=timeout + 2)
        except Exception as e:
            raise WorkerExecutionError(str(e))

def _atualizar_log_db(log_id: int, status: str):
    """Atualiza o status_final do log de execução no banco SQLite."""
    if not log_id:
        return
    try:
        from app.core.database import SessionLocal
        from app.models.execution_log import ExecutionLogModel
        db = SessionLocal()
        log = db.query(ExecutionLogModel).filter(ExecutionLogModel.id == log_id).first()
        if log:
            log.status_final = status
            db.commit()
        db.close()
        print(f"[LOG] Log #{log_id} atualizado para '{status}'")
    except Exception as e:
        print(f"[AVISO] [LOG] Falha ao atualizar log #{log_id}: {e}")


def run_script_task(job_id: str, script_nome: str, sql_servidor: str, sql_pdv: str,
                   loja_id: str, alvo: str, parametros: dict, log_id: int = None):
    """
    Executa um script SQL em background e atualiza o log ao finalizar.

    Alvos suportados:
      - SERVIDOR       → roda sql_servidor no Servidor (banco LOJA)
      - TODOS_PDVS     → roda sql_pdv em cada IP de caixa (banco PDV)
      - PDV_ESPECIFICO → roda sql_pdv em 1 caixa específico (banco PDV)
      - AMBOS          → SERVIDOR + TODOS_PDVS
      - SERVIDOR_PDV   → roda sql_pdv no Servidor (banco PDV)
    """
    print(f"[INICIADO] [WORKER INICIADO] Job: {job_id} | Script '{script_nome}' | Loja: {loja_id} | Alvo: {alvo}")
    ACTIVE_JOBS[job_id] = {"status": "rodando", "etapas": []}
    
    def update_etapa(nome, status, detalhe=None):
        for e in ACTIVE_JOBS[job_id]["etapas"]:
            if e["nome"] == nome:
                e["status"] = status
                if detalhe:
                    e["detalhe"] = detalhe
                return
        entry = {"nome": nome, "status": status}
        if detalhe:
            entry["detalhe"] = detalhe
        ACTIVE_JOBS[job_id]["etapas"].append(entry)

    parametros = parametros or {}
    parametros["loja"] = loja_id
    parametros["loja_id"] = loja_id

    worker = OdbcWorker()
    status_final = "concluido"

    try:
        update_etapa(f"Conectando na Retaguarda ({worker.retaguarda_ip})", "rodando")
        store_info = worker.get_store_info(loja_id)
        update_etapa(f"Conectando na Retaguarda ({worker.retaguarda_ip})", "sucesso")
        
        # 1. Alvo SERVIDOR ou AMBOS: roda sql_servidor no Servidor (banco LOJA)
        if alvo in ["SERVIDOR", "AMBOS"] and sql_servidor:
            etapa_nome = f"Servidor da Loja ({store_info['ip_servidor']})"
            update_etapa(etapa_nome, "rodando")
            sql_final = sql_servidor
            for key, val in parametros.items():
                sql_final = sql_final.replace(f"{{{key}}}", str(val))
            try:
                worker.execute_sql(store_info["ip_servidor"], "LOJA", sql_final)
                update_etapa(etapa_nome, "sucesso")
            except Exception as e:
                update_etapa(etapa_nome, "erro", detalhe=str(e))

        # 2. Alvo SERVIDOR_PDV: roda sql_pdv no Servidor (banco PDV)
        if alvo == "SERVIDOR_PDV" and sql_pdv:
            etapa_nome = f"Servidor da Loja - Banco PDV ({store_info['ip_servidor']})"
            update_etapa(etapa_nome, "rodando")
            sql_final = sql_pdv
            for key, val in parametros.items():
                sql_final = sql_final.replace(f"{{{key}}}", str(val))
            try:
                worker.execute_sql(store_info["ip_servidor"], "PDV", sql_final)
                update_etapa(etapa_nome, "sucesso")
            except Exception as e:
                update_etapa(etapa_nome, "erro", detalhe=str(e))
            
        # 3. Alvos que rodam em PDVs individuais
        if alvo in ["TODOS_PDVS", "PDV_ESPECIFICO", "AMBOS"] and sql_pdv:
            pdvs_alvo = store_info["pdvs"]
            if alvo == "PDV_ESPECIFICO":
                try:
                    c_val = parametros.get("caixa", 0)
                    numero_caixa = int(c_val) if c_val else 0
                except (ValueError, TypeError):
                    numero_caixa = 0
                pdvs_alvo = [p for p in pdvs_alvo if p["caixa"] == numero_caixa]
            
            for pdv in pdvs_alvo:
                etapa_nome = f"PDV Caixa {pdv['caixa']} ({pdv['ip']})"
                update_etapa(etapa_nome, "rodando")
                sql_final = sql_pdv.replace("{caixa}", str(pdv["caixa"]))
                for key, val in parametros.items():
                    sql_final = sql_final.replace(f"{{{key}}}", str(val))
                try:
                    worker.execute_sql(pdv["ip"], "PDV", sql_final)
                    update_etapa(etapa_nome, "sucesso")
                except Exception as e:
                    update_etapa(etapa_nome, "erro", detalhe=str(e))
                time.sleep(0.3)

        ACTIVE_JOBS[job_id]["status"] = "concluido"
        print(f"[FIM] [WORKER FINALIZADO] Script '{script_nome}' concluído.")

    except Exception as e:
        status_final = "erro"
        update_etapa("Falha Geral", "erro", detalhe=str(e))
        ACTIVE_JOBS[job_id]["status"] = "erro"
        ACTIVE_JOBS[job_id]["erro_detalhe"] = str(e)
        print(f"[ERRO] [WORKER FATAL] {e}")

    finally:
        # Persiste o status real no banco (pendente → concluido ou erro)
        _atualizar_log_db(log_id, ACTIVE_JOBS[job_id]["status"])


# ── BROADCAST: roda um script em TODAS as lojas ativas ──────────────────────────────────

def run_broadcast_task(job_id: str, script_nome: str, sql_servidor: str, sql_pdv: str,
                       alvo: str, parametros: dict, lojas: list, log_id: int = None):
    """
    Roda um script em TODAS as lojas fornecidas, uma por uma.
    Cada loja gera uma etapa no ACTIVE_JOBS com sub-etapas de resultado.

    lojas: lista de dicts [{"id": int, "nome": str}, ...]
    """
    print(f"[BROADCAST] [BROADCAST INICIADO] Job: {job_id} | Script '{script_nome}' | {len(lojas)} lojas | Alvo: {alvo}")
    ACTIVE_JOBS[job_id] = {"status": "rodando", "etapas": [], "broadcast": True, "total_lojas": len(lojas)}

    def update_etapa(nome, status, detalhe=None):
        for e in ACTIVE_JOBS[job_id]["etapas"]:
            if e["nome"] == nome:
                e["status"] = status
                if detalhe:
                    e["detalhe"] = detalhe
                return
        entry = {"nome": nome, "status": status}
        if detalhe:
            entry["detalhe"] = detalhe
        ACTIVE_JOBS[job_id]["etapas"].append(entry)

    worker = OdbcWorker()
    erros = 0

    for loja in lojas:
        loja_id  = str(loja["id"])
        loja_nom = loja.get("nome", f"Loja {loja_id}")
        etapa_nome = f"{loja_nom} (#{loja_id})"
        update_etapa(etapa_nome, "rodando")

        params = dict(parametros or {})
        params["loja"] = loja_id
        params["loja_id"] = loja_id

        try:
            store_info = worker.get_store_info(loja_id)

            # — Servidor (banco LOJA)
            if alvo in ["SERVIDOR", "AMBOS"] and sql_servidor:
                sql_f = sql_servidor
                for k, v in params.items():
                    sql_f = sql_f.replace(f"{{{k}}}", str(v))
                worker.execute_sql(store_info["ip_servidor"], "LOJA", sql_f)

            # — Servidor (banco PDV)
            if alvo == "SERVIDOR_PDV" and sql_pdv:
                sql_f = sql_pdv
                for k, v in params.items():
                    sql_f = sql_f.replace(f"{{{k}}}", str(v))
                worker.execute_sql(store_info["ip_servidor"], "PDV", sql_f)

            # — Todos os caixas
            if alvo in ["TODOS_PDVS", "AMBOS"] and sql_pdv:
                for pdv in store_info["pdvs"]:
                    sql_f = sql_pdv.replace("{caixa}", str(pdv["caixa"]))
                    for k, v in params.items():
                        sql_f = sql_f.replace(f"{{{k}}}", str(v))
                    try:
                        worker.execute_sql(pdv["ip"], "PDV", sql_f)
                    except Exception as pdv_e:
                        print(f"[AVISO] [BROADCAST] PDV {pdv['caixa']} da {loja_nom}: {pdv_e}")
                    time.sleep(0.3)

            update_etapa(etapa_nome, "sucesso")

        except Exception as e:
            erros += 1
            update_etapa(etapa_nome, "erro", detalhe=str(e))
            print(f"[ERRO] [BROADCAST] Falha na {loja_nom}: {e}")

        time.sleep(0.5)  # Pausa entre lojas para não sobrecarregar a rede

    status_final = "concluido" if erros == 0 else ("erro" if erros == len(lojas) else "concluido")
    ACTIVE_JOBS[job_id]["status"] = status_final
    ACTIVE_JOBS[job_id]["erros_count"] = erros
    print(f"[FIM] [BROADCAST FINALIZADO] {len(lojas) - erros}/{len(lojas)} lojas com sucesso.")
    _atualizar_log_db(log_id, status_final)


def run_store_scan(loja_id: int, regras: list):
    worker = OdbcWorker()
    store_info = worker.get_store_info(loja_id)
    
    # Pre-processa o "Valor Esperado" de todas as regras
    regras_processadas = []
    for regra in regras:
        esperado = regra.valor_esperado.strip()
        if getattr(regra, "valor_esperado_is_query", False) or esperado.upper().startswith("SELECT"):
            sql_ret = esperado.replace("{loja_id}", str(loja_id)).replace("{loja}", str(loja_id))
            try:
                conn = worker.connect_retaguarda()
                cursor = conn.cursor()
                cursor.execute(sql_ret)
                row = cursor.fetchone()
                conn.close()
                esperado = str(row[0]).strip() if row else "VAZIO_NA_RETAGUARDA"
            except Exception as e:
                esperado = "ERRO_SQL_RETAGUARDA"
                
        regras_processadas.append({
            "grupo_nome": regra.grupo.nome if regra.grupo else regra.nome,
            "grupo_descricao": regra.grupo.descricao if regra.grupo and regra.grupo.descricao else "Verificação de parametrização.",
            "regra_nome": regra.nome,
            "tipo_alvo": regra.tipo_alvo,
            "sql_query": regra.sql_query,
            "valor_esperado": esperado
        })
    
    resultado = {
        "loja_id": loja_id,
        "servidor": {"status": "offline", "parametros": [], "erros": []},
        "pdvs": []
    }
    
    def check_target(ip, is_servidor, caixa_id=None):
        base = "LOJA" if is_servidor else "PDV"
        tipo_alvo_req = "SERVIDOR" if is_servidor else "PDV"
        
        status = "online"
        parametros_ok = []
        erros = []
        
        # Faz um PING rápido na porta 1433 do TCP para não travar o ThreadPool com timeouts longos
        clean_ip = ip.split('\\')[0]
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        try:
            result = sock.connect_ex((clean_ip, 1433))
            sock.close()
            if result != 0:
                return {"ip": ip, "caixa": caixa_id, "status": "offline", "parametros": [], "erros": []}
        except:
            sock.close()
            return {"ip": ip, "caixa": caixa_id, "status": "offline", "parametros": [], "erros": []}
        
        try:
            worker.execute_query(ip, base, "SELECT 1", timeout=3)
        except Exception:
            return {"ip": ip, "caixa": caixa_id, "status": "offline", "parametros": [], "erros": []}
            
        # Agrupar regras por nome do grupo para consolidar em uma unica TAG
        regras_agrupadas = {}
        for regra in regras_processadas:
            if regra["tipo_alvo"] in [tipo_alvo_req, "AMBOS"]:
                nome_g = regra["grupo_nome"]
                if nome_g not in regras_agrupadas:
                    regras_agrupadas[nome_g] = {"descricao": regra["grupo_descricao"], "regras": []}
                regras_agrupadas[nome_g]["regras"].append(regra)
                
        for nome_grupo, data_grupo in regras_agrupadas.items():
            grupo_valido = True
            erros_do_grupo = []
            tooltip_lines = [f"Objetivo: {data_grupo['descricao']}\n", "Regras analisadas:"]
            
            for regra in data_grupo["regras"]:
                tooltip_lines.append(f"• {regra['regra_nome']} (Esp: {regra['valor_esperado']})")
                try:
                    res = worker.execute_query(ip, base, regra["sql_query"], timeout=3)
                    if res.strip().upper() != regra["valor_esperado"].upper():
                        grupo_valido = False
                        erros_do_grupo.append(f"Retornou: {res}")
                except Exception as e:
                    grupo_valido = False
                    erros_do_grupo.append("Erro na Query SQL")
                    
            tooltip = "\n".join(tooltip_lines)
                    
            if grupo_valido:
                parametros_ok.append({"nome": nome_grupo, "tooltip": f"Validações OK:\n{tooltip}"})
            else:
                # Remove itens vazios
                erros_do_grupo = [e for e in set(erros_do_grupo) if e]
                msg_erro = f"{nome_grupo} ({' | '.join(erros_do_grupo)})"
                erros.append({"nome": msg_erro, "tooltip": f"Falha na validação:\n{tooltip}"})
                    
        return {"ip": ip, "caixa": caixa_id, "status": status, "parametros": parametros_ok, "erros": erros}
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
        futures = []
        futures.append(executor.submit(check_target, store_info["ip_servidor"], True))
        
        for pdv in store_info["pdvs"]:
            futures.append(executor.submit(check_target, pdv["ip"], False, pdv["caixa"]))
            
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res.get("caixa") is None:
                resultado["servidor"] = {
                    "status": res["status"],
                    "parametros": res["parametros"],
                    "erros": res["erros"]
                }
            else:
                resultado["pdvs"].append({
                    "id": res["caixa"],
                    "status": res["status"],
                    "parametros": res["parametros"],
                    "erros": res["erros"]
                })
                
    resultado["pdvs"] = sorted(resultado["pdvs"], key=lambda x: x["id"])
    return resultado

