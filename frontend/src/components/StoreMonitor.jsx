import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Server, Monitor, Play, ArrowLeft, X, WifiOff, AlertTriangle, RefreshCw,
         User, Clock, Cpu, MemoryStick, Network, HardDrive, Database, HelpCircle } from 'lucide-react';

const API = 'http://127.0.0.1:8080/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatUptime(s) {
  if (s == null) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRam(mb) {
  if (mb == null) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;
}

function formatDbSize(mb) {
  if (mb == null) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
}

function sqlVersionToYear(version) {
  if (!version) return 'SQL Server';
  const major = parseFloat(version.split('.').slice(0, 2).join('.'));
  if (major >= 16)   return 'SQL 2022';
  if (major >= 15)   return 'SQL 2019';
  if (major >= 14)   return 'SQL 2017';
  if (major >= 13)   return 'SQL 2016';
  if (major >= 12)   return 'SQL 2014';
  if (major >= 11)   return 'SQL 2012';
  if (major >= 10.5) return 'SQL 2008 R2';
  if (major >= 10)   return 'SQL 2008';
  if (major >= 9)    return 'SQL 2005';
  return 'SQL Server';
}

function sqlEditionShort(edition) {
  if (!edition) return null;
  return edition
    .replace(' with Advanced Services', '')
    .replace(' Edition', '')
    .replace(' (64-bit)', '')
    .replace(' (32-bit)', '')
    .trim();
}

function PcInfoChip({ icon, label, value, color }) {
  if (!value) return null;
  const accent = color || 'rgba(255,255,255,0.1)';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'rgba(255,255,255,0.04)', borderRadius: 7,
      padding: '5px 9px', border: `1px solid ${accent}`,
      minWidth: 0, flex: '1 1 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#475569', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <span style={{ color, display: 'flex' }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  );
}

function WmiPanel({ pcData }) {
  if (!pcData) return null;

  if (pcData.status === 'offline') return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569' }}>
      <WifiOff size={12} /> Sem resposta na rede
    </div>
  );

  if (pcData.status === 'sem_wmi') return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#f59e0b' }}>
      <AlertTriangle size={12} /> Não foi possível obter dados do PC
    </div>
  );

  const sqlYear  = sqlVersionToYear(pcData.sql_version);
  const sqlShort = sqlEditionShort(pcData.sql_edition);

  return (
    <div style={{ marginTop: 10 }}>
      {/* Grid: CPU / RAM / IP / Uptime */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
        <PcInfoChip icon={<Cpu size={10} />}        label="CPU"    value={pcData.cpu_nucleos ? `${pcData.cpu_nucleos} núcleos` : null} color="#fbbf24" />
        <PcInfoChip icon={<MemoryStick size={10} />} label="RAM"    value={formatRam(pcData.ram_total_mb)}                               color="#34d399" />
        <PcInfoChip icon={<Database size={10} />}    label="Banco"  value={formatDbSize(pcData.db_size_mb)}                              color="#f472b6" />
        <PcInfoChip icon={<Network size={10} />}     label="IP"     value={pcData.ip_local || pcData.ip}                                  color="#60a5fa" />
        <PcInfoChip icon={<Clock size={10} />}       label="Uptime" value={formatUptime(pcData.uptime_segundos) ? `↑ ${formatUptime(pcData.uptime_segundos)}` : null} color="#a78bfa" />
        {pcData.os_version && (
          <div style={{ gridColumn: '1 / -1' }}>
            <PcInfoChip icon={<HardDrive size={10} />} label="Sistema" value={pcData.os_version} color="#94a3b8" />
          </div>
        )}
      </div>
      {/* SQL Server badge */}
      {pcData.sql_version && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 7, padding: '5px 9px',
        }}>
          <Database size={11} color="#818cf8" />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>{sqlYear}</span>
          {sqlShort && <span style={{ fontSize: 11, color: '#94a3b8' }}>{sqlShort}</span>}
          <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{pcData.sql_version}</span>
          {pcData.sql_level && (
            <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(99,102,241,0.15)', borderRadius: 4, padding: '1px 5px' }}>
              {pcData.sql_level}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────────
export default function StoreMonitor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [pcMap, setPcMap] = useState({});
  const [wmiScanning, setWmiScanning] = useState(false);

  const [executando, setExecutando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [scriptSelecionado, setScriptSelecionado] = useState(null);
  const [alvo, setAlvo] = useState('AMBOS');
  const [caixaId, setCaixaId] = useState('');

  const [monitoramentoAberto, setMonitoramentoAberto] = useState(false);
  const [jobStatus, setJobStatus] = useState(null);

  // Refs para controlar intervals sem causar re-renders
  const autoScanIntervalRef = useRef(null);
  const pollRef = useRef(null);
  const isScanningRef = useRef(false); // flag de controle sem re-render

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // ── Busca dados WMI já salvos no banco ──
  const fetchWmiData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/agentes/${id}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      for (const snap of data) {
        map[snap.tipo === 'SERVIDOR' ? 'SERVIDOR' : `PDV_${snap.caixa_id}`] = snap;
      }
      setPcMap(map);
    } catch {}
  }, [id, token]);

  // ── Dispara scan WMI (protegido contra chamadas duplas) ──
  const handleWmiScan = useCallback(async () => {
    if (isScanningRef.current) return; // já está rodando, ignora
    isScanningRef.current = true;
    setWmiScanning(true);

    try {
      const res = await fetch(`${API}/agentes/scan/${id}`, { method: 'POST', headers });
      if (!res.ok) throw new Error('Erro ao iniciar scan');

      // Para poll anterior se existir
      clearInterval(pollRef.current);

      // Poll a cada 2s para saber quando terminou
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API}/agentes/scan/${id}/status`, { headers });
          const d = await r.json();
          if (!d.scan_em_andamento) {
            clearInterval(pollRef.current);
            isScanningRef.current = false;
            setWmiScanning(false);
            fetchWmiData(); // Atualiza os cards com os novos dados
            fetchAuditStatus(); // Atualiza as flags de auditoria
          }
        } catch {
          clearInterval(pollRef.current);
          isScanningRef.current = false;
          setWmiScanning(false);
        }
      }, 2000);

    } catch {
      isScanningRef.current = false;
      setWmiScanning(false);
    }
  }, [id, token, fetchWmiData]);

  // ── Carrega dados estáticos (audit + scripts) ──
  const fetchAuditStatus = useCallback(() => {
    fetch(`${API}/lojas/${id}/status`, { 
      headers: { ...headers, 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } 
    })
      .then(r => r.json())
      .then(data => {
        console.log("Status de Auditoria recebido do backend:", data);
        setStatus(data);
      })
      .catch(console.error);
  }, [id, token]);

  useEffect(() => {
    fetchAuditStatus();

    fetch(`${API}/scripts/?apenas_publicados=true`, { headers })
      .then(r => r.json()).then(setScripts).catch(console.error);

    fetchWmiData(); // Mostra dados do último scan salvo enquanto o novo escaneia
  }, [id, fetchAuditStatus]);

  // ── Auto-scan: dispara ao abrir e repete a cada 30s ──
  useEffect(() => {
    handleWmiScan(); // Scan imediato ao entrar

    autoScanIntervalRef.current = setInterval(() => {
      handleWmiScan(); // Repetição a cada 30s
    }, 30000);

    // Cleanup: para tudo ao sair da tela
    return () => {
      clearInterval(autoScanIntervalRef.current);
      clearInterval(pollRef.current);
    };
  }, [handleWmiScan]);

  // ── Execução de scripts ──
  const abrirModal = (script) => {
    setScriptSelecionado(script);
    setAlvo('AMBOS');
    setCaixaId('');
    setModalAberto(true);
  };

  const handleExecute = async (e) => {
    e.preventDefault();
    setExecutando(true);
    const payload = {
      script_id: scriptSelecionado.id,
      loja_id: id,
      alvo,
      parametros: (alvo === 'PDV_ESPECIFICO' || (scriptSelecionado.parametros_exigidos || []).includes('caixa')) 
                  ? { caixa: caixaId } 
                  : {}
    };
    try {
      const res = await fetch(`${API}/execucoes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setModalAberto(false);
        setJobStatus(null);
        setMonitoramentoAberto(true);
        iniciarPolling(data.job_id);
      } else {
        alert('Erro ao executar script.');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setExecutando(false);
    }
  };

  const iniciarPolling = (idJob) => {
    const intervalo = setInterval(async () => {
      try {
        const res = await fetch(`${API}/execucoes/${idJob}/status`, { headers });
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === 'concluido' || data.status === 'erro') {
            clearInterval(intervalo);
            if (data.status === 'concluido') {
              fetchAuditStatus(); // Reavalia as regras de auditoria para atualizar as flags
            }
          }
        }
      } catch {}
    }, 1000);
  };

  // ── Loading ──
  if (!status) return (
    <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
      <Monitor size={48} color="#64748b" style={{ marginBottom: '1rem' }} />
      <h3>Conectando na Loja {id}...</h3>
      <p>Consultando o Servidor e todos os Caixas via SQL Server para validar os padrões de auditoria.</p>
      <p style={{ fontSize: '2rem' }}>⏳</p>
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn" onClick={() => navigate('/dashboard')} style={{ background: 'transparent', padding: '8px' }}>
            <ArrowLeft size={20} />
          </button>
          <h2 style={{ margin: 0 }}>Monitoramento: Loja {id}</h2>
        </div>

        {/* Botão de atualização manual + indicador de scan automático */}
        <button
          onClick={handleWmiScan}
          disabled={wmiScanning}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: wmiScanning ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.6)',
            border: '1px solid rgba(99,102,241,0.4)', borderRadius: '8px',
            color: wmiScanning ? '#818cf8' : 'white', padding: '8px 16px',
            cursor: wmiScanning ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 600, transition: 'all 0.2s'
          }}
        >
          <RefreshCw size={14} style={{ animation: wmiScanning ? 'spin 1.2s linear infinite' : 'none' }} />
          {wmiScanning ? 'Escaneando PCs...' : 'Atualizar PCs'}
        </button>
      </div>

      {/* ── Ações (Scripts) ── */}
      <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Ações Disponíveis</h3>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {scripts.map(s => (
          <button key={s.id} className="btn" onClick={() => abrirModal(s)}>
            <Play size={18} /> {s.nome}
          </button>
        ))}
        {scripts.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Nenhum script publicado pelo Admin.</span>}
      </div>

      {/* ── Servidor ── */}
      <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Servidor</h3>
      <div className="pc-grid" style={{ marginBottom: '2rem' }}>
        <div className={`glass-panel pc-card ${status.servidor.status === 'online' ? 'pc-online' : 'pc-offline'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <Server size={24} color={status.servidor.status === 'online' ? '#34d399' : '#94a3b8'} />
              <div>
                <span style={{ fontWeight: 'bold', display: 'block' }}>Servidor Principal</span>
                {pcMap['SERVIDOR']?.hostname && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{pcMap['SERVIDOR'].hostname}</span>
                )}
              </div>
            </div>
            <span className={`status-badge status-${status.servidor.status}`}>
              {status.servidor.status.toUpperCase()}
            </span>
          </div>

          <div className="tag-list" style={{ marginTop: '10px' }}>
            {status.servidor.parametros?.map((p, idx) => (
              <span key={idx} className="tag tooltip-container" style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span>✅ {typeof p === 'object' ? p.nome : p}</span>
                <HelpCircle size={14} style={{ opacity: 0.7 }} />
                {typeof p === 'object' && p.tooltip && <span className="tooltip-text">{p.tooltip}</span>}
              </span>
            ))}
            {status.servidor.erros?.map((e, idx) => (
              <span key={idx} className="tag tooltip-container" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span>❌ {typeof e === 'object' ? e.nome : e}</span>
                <HelpCircle size={14} style={{ opacity: 0.7 }} />
                {typeof e === 'object' && e.tooltip && <span className="tooltip-text">{e.tooltip}</span>}
              </span>
            ))}
          </div>

          <WmiPanel pcData={pcMap['SERVIDOR']} />
        </div>
      </div>

      {/* ── PDVs ── */}
      <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Caixas (PDVs)</h3>
      <div className="pc-grid">
        {status.pdvs.map(pdv => {
          const pcData = pcMap[`PDV_${pdv.id}`];
          return (
            <div key={pdv.id} className={`glass-panel pc-card ${pdv.status === 'online' ? 'pc-online' : 'pc-offline'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Monitor size={24} color={pdv.status === 'online' ? '#818cf8' : '#94a3b8'} />
                  <div>
                    <span style={{ fontWeight: 'bold', display: 'block' }}>PDV {String(pdv.id).padStart(2, '0')}</span>
                    {pcData?.hostname && (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{pcData.hostname}</span>
                    )}
                  </div>
                </div>
                <span className={`status-badge status-${pdv.status}`}>
                  {pdv.status.toUpperCase()}
                </span>
              </div>

              {pdv.status === 'offline' && !pcData && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '5px 0 0 0' }}>
                  Computador inativo ou sem rede
                </p>
              )}

              {(pdv.parametros?.length > 0 || pdv.erros?.length > 0) && (
                <div className="tag-list" style={{ marginTop: '10px' }}>
                  {pdv.parametros?.map((p, idx) => (
                    <span key={idx} className="tag tooltip-container" style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span>✅ {typeof p === 'object' ? p.nome : p}</span>
                      <HelpCircle size={14} style={{ opacity: 0.7 }} />
                      {typeof p === 'object' && p.tooltip && <span className="tooltip-text">{p.tooltip}</span>}
                    </span>
                  ))}
                  {pdv.erros?.map((e, idx) => (
                    <span key={idx} className="tag tooltip-container" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span>❌ {typeof e === 'object' ? e.nome : e}</span>
                      <HelpCircle size={14} style={{ opacity: 0.7 }} />
                      {typeof e === 'object' && e.tooltip && <span className="tooltip-text">{e.tooltip}</span>}
                    </span>
                  ))}
                </div>
              )}

              <WmiPanel pcData={pcData} />
            </div>
          );
        })}
      </div>

      {/* ── MODAL DE EXECUÇÃO ── */}
      {modalAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '450px', position: 'relative' }}>
            <button onClick={() => setModalAberto(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <h3 style={{ marginTop: 0 }}>Executar: {scriptSelecionado?.nome}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{scriptSelecionado?.descricao}</p>

            <form onSubmit={handleExecute}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Onde deseja rodar este script?</label>
                <select value={alvo} onChange={e => setAlvo(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px' }}>
                  <option value="AMBOS">Em Todos os PCs (Servidor e Todos os Caixas)</option>
                  <option value="TODOS_PDVS">Apenas em Todos os Caixas</option>
                  <option value="SERVIDOR">Apenas no Servidor</option>
                  <option value="PDV_ESPECIFICO">Apenas em um Caixa Específico</option>
                </select>
              </div>

              {alvo === 'PDV_ESPECIFICO' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label>Número do Caixa</label>
                  <input type="number" required value={caixaId} onChange={e => setCaixaId(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px' }} placeholder="Ex: 1" />
                </div>
              )}

              {scriptSelecionado?.parametros_exigidos.includes('caixa') && alvo !== 'PDV_ESPECIFICO' && (
                <div style={{ marginBottom: '1.5rem', padding: '10px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '6px', fontSize: '0.85rem' }}>
                  Atenção: Este script exige um número de Caixa. Selecione "Caixa Específico" no Alvo.
                </div>
              )}

              <button type="submit" className="btn" disabled={executando} style={{ width: '100%', justifyContent: 'center', background: '#34d399' }}>
                {executando ? 'Iniciando Robô...' : 'Confirmar e Disparar Script'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL RADAR AO VIVO ── */}
      {monitoramentoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '500px', position: 'relative' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Monitor size={20} color="#60a5fa" /> Radar de Execução Ao Vivo
            </h3>

            {jobStatus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                {jobStatus.etapas.map((etapa, idx) => {
                  const isOffline = etapa.status === 'erro' && etapa.detalhe &&
                    (etapa.detalhe.toLowerCase().includes('offline') || etapa.detalhe.toLowerCase().includes('porta 1433'));
                  const borderColor = etapa.status === 'rodando' ? '#f59e0b'
                    : etapa.status === 'sucesso' ? '#34d399'
                    : isOffline ? '#f97316'
                    : etapa.status === 'erro' ? '#ef4444'
                    : 'transparent';
                  return (
                    <div key={idx} style={{
                      background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px',
                      borderLeft: `3px solid ${borderColor}`,
                      display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontWeight: 500 }}>{etapa.nome}</span>
                        <span>
                          {etapa.status === 'pendente' && <span style={{ color: 'var(--text-muted)' }}>Aguardando...</span>}
                          {etapa.status === 'rodando' && <span style={{ color: '#f59e0b' }}>⏳ Conectando</span>}
                          {etapa.status === 'sucesso' && <span style={{ color: '#34d399' }}>✅ Finalizado</span>}
                          {etapa.status === 'erro' && isOffline && (
                            <span style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <WifiOff size={14} /> Offline
                            </span>
                          )}
                          {etapa.status === 'erro' && !isOffline && <span style={{ color: '#ef4444' }}>❌ Falha</span>}
                        </span>
                      </div>
                      {etapa.status === 'erro' && etapa.detalhe && (
                        <div style={{
                          fontSize: '11px',
                          color: isOffline ? '#fed7aa' : '#fca5a5',
                          background: isOffline ? 'rgba(249,115,22,0.1)' : 'rgba(239,68,68,0.1)',
                          borderRadius: '4px', padding: '6px 8px', fontFamily: 'monospace',
                          wordBreak: 'break-all', maxHeight: '80px', overflowY: 'auto'
                        }}>
                          {etapa.detalhe}
                        </div>
                      )}
                    </div>
                  );
                })}


                {jobStatus.status === 'concluido' && (
                  <div style={{ marginTop: '20px', textAlign: 'center', color: '#34d399', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    🎉 Missão Cumprida! Script executado em todos os alvos.
                  </div>
                )}
                {jobStatus.status === 'erro' && (
                  <div style={{ marginTop: '20px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ⚠️ A Execução encontrou um erro grave.
                  </div>
                )}
                {(jobStatus.status === 'concluido' || jobStatus.status === 'erro') && (
                  <button className="btn" onClick={() => setMonitoramentoAberto(false)} style={{ marginTop: '20px', justifyContent: 'center', background: '#475569', width: '100%' }}>
                    Fechar Radar
                  </button>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <p>Acordando o robô na Retaguarda...</p>
                <p style={{ fontSize: '2rem' }}>⏳</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
