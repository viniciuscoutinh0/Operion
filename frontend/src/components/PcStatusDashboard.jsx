import { useState, useEffect, useCallback } from 'react';
import { Monitor, Wifi, WifiOff, AlertTriangle, RefreshCw, Server, ShoppingCart,
         User, Clock, Cpu, MemoryStick, Database, Network, HardDrive } from 'lucide-react';

const API = 'http://127.0.0.1:8080/api';

function formatUptime(s) {
  if (s == null) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRam(mb) {
  if (mb == null) return null;
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

function formatDbSize(mb) {
  if (mb == null) return null;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

function formatLastSeen(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'Z').toLocaleString('pt-BR');
}

function StatusBadge({ status }) {
  const cfg = {
    online:       { label: 'Online',     color: '#10b981', bg: 'rgba(16,185,129,0.15)',  icon: <Wifi size={11} /> },
    offline:      { label: 'Offline',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: <WifiOff size={11} /> },
    sem_wmi:      { label: 'Sem dados',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: <AlertTriangle size={11} /> },
    desconhecido: { label: 'Aguardando', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: <Clock size={11} /> },
  };
  const s = cfg[status] || cfg['desconhecido'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.color}40`,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function InfoChip({ icon, label, value, accent }) {
  if (!value) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'rgba(255,255,255,0.04)', borderRadius: 8,
      padding: '7px 10px', border: `1px solid ${accent || 'rgba(255,255,255,0.08)'}`,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <span style={{ color: accent || '#64748b', display: 'flex' }}>{icon}</span>
        {label}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  );
}

// Mapeia ProductVersion (ex: "10.50.6000") para nome de ano (ex: "SQL 2008 R2")
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

// Simplifica o tipo de edição retirando ruido
function sqlEditionShort(edition) {
  if (!edition) return null;
  // Remove sufixos verbosos comuns
  return edition
    .replace(' with Advanced Services', '')
    .replace(' Edition', '')
    .replace(' (64-bit)', '')
    .replace(' (32-bit)', '')
    .trim();
}

function SqlBadge({ version, edition, level }) {
  if (!version) return null;
  const year  = sqlVersionToYear(version);
  const short = sqlEditionShort(edition);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 8, padding: '6px 10px',
    }}>
      <Database size={12} color="#818cf8" />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>{year}</span>
      {short && <span style={{ fontSize: 11, color: '#94a3b8' }}>{short}</span>}
      <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{version}</span>
      {level && <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(99,102,241,0.15)', borderRadius: 4, padding: '1px 5px' }}>{level}</span>}
    </div>
  );
}

function PcCard({ pc }) {
  const isServ = pc.tipo === 'SERVIDOR';
  const online = pc.status === 'online';
  const border = online ? '#10b981' : pc.status === 'sem_wmi' ? '#f59e0b' : '#1e293b';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.035)', borderRadius: 14,
      border: `1px solid ${border}35`, padding: '16px 18px',
      transition: 'transform 0.18s, border-color 0.18s', position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {online && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #10b981, transparent)' }} />
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isServ ? 'rgba(129,140,248,0.15)' : 'rgba(99,102,241,0.10)',
            border: isServ ? '1px solid rgba(129,140,248,0.3)' : '1px solid rgba(99,102,241,0.2)',
          }}>
            {isServ ? <Server size={18} color="#818cf8" /> : <ShoppingCart size={18} color="#6366f1" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>
              {pc.hostname || pc.ip}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              {isServ ? '🖥 Servidor' : `🖨 Caixa ${pc.caixa_id ?? '—'}`} · {pc.ip}
            </div>
          </div>
        </div>
        <StatusBadge status={pc.status} />
      </div>

      {/* Dados detalhados */}
      {online && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <InfoChip icon={<Cpu size={11} />}         label="CPU"    value={pc.cpu_nucleos ? `${pc.cpu_nucleos} núcleos` : null}    accent="rgba(251,191,36,0.4)" />
            <InfoChip icon={<MemoryStick size={11} />}  label="RAM"    value={formatRam(pc.ram_total_mb)}                              accent="rgba(52,211,153,0.4)" />
            <InfoChip icon={<Database size={11} />}     label="Banco"  value={formatDbSize(pc.db_size_mb)}                             accent="rgba(244,114,182,0.4)" />
            <InfoChip icon={<Network size={11} />}      label="IP"     value={pc.ip_local || pc.ip}                                    accent="rgba(96,165,250,0.4)" />
            <InfoChip icon={<Clock size={11} />}        label="Uptime" value={formatUptime(pc.uptime_segundos)}                        accent="rgba(167,139,250,0.4)" />
            {pc.os_version && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoChip icon={<HardDrive size={11} />} label="Sistema Operacional" value={pc.os_version} accent="rgba(148,163,184,0.3)" />
              </div>
            )}
          </div>
          <SqlBadge version={pc.sql_version} edition={pc.sql_edition} level={pc.sql_level} />
        </>
      )}

      {pc.status === 'sem_wmi' && (
        <p style={{ fontSize: 12, color: '#f59e0b', margin: '8px 0 0 0' }}>
          ⚠️ PC acessível mas não foi possível obter dados via SQL
        </p>
      )}
      {pc.status === 'offline' && (
        <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0 0' }}>Sem resposta na rede</p>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#334155' }}>
        Última atualização: {formatLastSeen(pc.ultima_atualizacao)}
      </div>
    </div>
  );
}

function StoreGroup({ lojaId, pcs }) {
  const online = pcs.filter(p => p.status === 'online').length;
  const semWmi = pcs.filter(p => p.status === 'sem_wmi').length;
  const offline = pcs.filter(p => p.status === 'offline').length;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        padding: '10px 16px', background: 'rgba(129,140,248,0.07)',
        borderRadius: 10, border: '1px solid rgba(129,140,248,0.15)',
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#818cf8' }}>🏪 Loja {lojaId}</h3>
        <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
          <span style={{ color: '#10b981' }}>✓ {online} online</span>
          {semWmi > 0 && <span style={{ color: '#f59e0b' }}>⚠ {semWmi} sem dados</span>}
          {offline > 0 && <span style={{ color: '#ef4444' }}>✗ {offline} offline</span>}
          <span style={{ color: '#475569' }}>/ {pcs.length} total</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {pcs
          .sort((a, b) => {
            if (a.tipo === 'SERVIDOR') return -1;
            if (b.tipo === 'SERVIDOR') return 1;
            return (a.caixa_id ?? 0) - (b.caixa_id ?? 0);
          })
          .map(pc => <PcCard key={`${pc.loja_id}-${pc.ip}`} pc={pc} />)
        }
      </div>
    </div>
  );
}

export default function PcStatusDashboard() {
  const token = localStorage.getItem('token');
  const [pcs, setPcs] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [selectedLoja, setSelectedLoja] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanLojaId, setScanLojaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const fetchPcs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/agentes/`, { headers });
      if (!res.ok) throw new Error();
      setPcs(await res.json());
      setLastRefresh(new Date());
    } catch { setError('Erro ao carregar dados dos PCs.'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchLojas = useCallback(async () => {
    try {
      const res = await fetch(`${API}/lojas/`, { headers });
      if (res.ok) setLojas(await res.json());
    } catch {}
  }, [token]);

  const handleScan = async () => {
    if (!scanLojaId) return;
    setScanning(true);
    try {
      await fetch(`${API}/agentes/scan/${scanLojaId}`, { method: 'POST', headers });
      const poll = setInterval(async () => {
        const r = await fetch(`${API}/agentes/scan/${scanLojaId}/status`, { headers });
        const d = await r.json();
        if (!d.scan_em_andamento) { clearInterval(poll); setScanning(false); fetchPcs(); }
      }, 2000);
    } catch { setScanning(false); }
  };

  useEffect(() => {
    fetchPcs(); fetchLojas();
    const iv = setInterval(fetchPcs, 60000);
    return () => clearInterval(iv);
  }, [fetchPcs, fetchLojas]);

  const filtered = selectedLoja ? pcs.filter(p => String(p.loja_id) === selectedLoja) : pcs;
  const grouped = filtered.reduce((acc, pc) => { (acc[pc.loja_id] ??= []).push(pc); return acc; }, {});

  const totalOnline  = pcs.filter(p => p.status === 'online').length;
  const totalOffline = pcs.filter(p => p.status === 'offline').length;
  const totalSemWmi  = pcs.filter(p => p.status === 'sem_wmi').length;

  const summaryCards = [
    { label: 'Monitorados', value: pcs.length,    color: '#818cf8', icon: <Monitor size={20} /> },
    { label: 'Online',      value: totalOnline,   color: '#10b981', icon: <Wifi size={20} /> },
    { label: 'Offline',     value: totalOffline,  color: '#ef4444', icon: <WifiOff size={20} /> },
    { label: 'Sem Dados',   value: totalSemWmi,   color: '#f59e0b', icon: <AlertTriangle size={20} /> },
  ];

  return (
    <div style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Monitor size={26} color="#818cf8" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>Monitor de PCs</h2>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
          CPU, RAM, SQL Server e sistema operacional — via conexão ODBC, sem instalar nada.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {summaryCards.map(c => (
          <div key={c.label} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 12,
            border: `1px solid ${c.color}28`, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ color: c.color }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 24, padding: '14px 16px',
        background: 'rgba(255,255,255,0.025)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <select value={selectedLoja} onChange={e => setSelectedLoja(e.target.value)} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13, flex: 1, minWidth: 150, cursor: 'pointer',
        }}>
          <option value="">Todas as Lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.id} — {l.nome}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8, flex: 2, minWidth: 260 }}>
          <select value={scanLojaId} onChange={e => setScanLojaId(e.target.value)} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13, flex: 1, cursor: 'pointer',
          }}>
            <option value="">Selecionar loja para scan...</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.id} — {l.nome}</option>)}
          </select>
          <button onClick={handleScan} disabled={!scanLojaId || scanning} style={{
            background: scanning ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.75)',
            border: 'none', borderRadius: 8, color: 'white', padding: '8px 16px',
            cursor: scanning ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <Wifi size={13} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
            {scanning ? 'Escaneando...' : 'Iniciar Scan'}
          </button>
        </div>

        <button onClick={fetchPcs} disabled={loading} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8, color: '#94a3b8', padding: '8px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
        }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>

        {lastRefresh && (
          <span style={{ fontSize: 11, color: '#334155', whiteSpace: 'nowrap' }}>
            {lastRefresh.toLocaleTimeString('pt-BR')}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {pcs.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px',
          background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.08)' }}>
          <Monitor size={44} color="#1e293b" style={{ marginBottom: 14 }} />
          <h3 style={{ color: '#475569', margin: '0 0 8px 0' }}>Nenhum PC monitorado ainda</h3>
          <p style={{ color: '#334155', margin: 0, fontSize: 13 }}>
            Selecione uma loja e clique em <strong style={{ color: '#818cf8' }}>Iniciar Scan</strong>.
          </p>
        </div>
      )}

      {Object.entries(grouped)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([lojaId, pcList]) => <StoreGroup key={lojaId} lojaId={lojaId} pcs={pcList} />)
      }

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
