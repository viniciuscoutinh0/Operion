import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Play, AlertTriangle, X, Search, CheckCircle, WifiOff, RefreshCw, ArrowLeft, FileText, Clipboard, ClipboardCheck } from 'lucide-react';

const API = `http://${window.location.hostname}:8080/api`;

export default function MassExecution() {
  const navigate = useNavigate();

  const [scripts, setScripts] = useState([]);
  const [scriptSelecionado, setScriptSelecionado] = useState(null);
  const [alvo, setAlvo] = useState('AMBOS');
  const [parametros, setParametros] = useState({});

  // Filtros de Lojas Destino para o Broadcast
  const [tipoSelecao, setTipoSelecao] = useState('TODAS');
  const [lojaDe, setLojaDe] = useState('');
  const [lojaAte, setLojaAte] = useState('');
  const [lojasIds, setLojasIds] = useState('');

  const [executando, setExecutando] = useState(false);
  const [monitoramentoAberto, setMonitoramentoAberto] = useState(false);
  const [jobStatus, setJobStatus] = useState(null);
  const [buscaLoja, setBuscaLoja] = useState('');
  const [abaRelatorio, setAbaRelatorio] = useState('offline');
  const [copiado, setCopiado] = useState(false);

  const pollRef = useRef(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const activeRole = localStorage.getItem('role');
    const permissions = localStorage.getItem('permissions') || '';
    if (activeRole !== 'TI' && activeRole !== 'Administradores' && activeRole !== 'Admin' && !permissions.includes('EXECUTAR_BROADCAST')) {
      alert('Acesso Negado: Você não tem permissão para disparar robôs globalmente.');
      navigate('/dashboard');
    }
  }, [navigate]);

  useEffect(() => {
    fetch(`${API}/scripts/?apenas_publicados=true`, { headers })
      .then(r => r.json())
      .then(data => setScripts(data))
      .catch(console.error);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleScriptChange = (e) => {
    const sId = parseInt(e.target.value);
    const selected = scripts.find(s => s.id === sId) || null;
    setScriptSelecionado(selected);
    setParametros({});
    if (selected) setAlvo(selected.alvo_fixo || 'AMBOS');
  };

  const handleParamChange = (nome, valor) => {
    setParametros(prev => ({ ...prev, [nome]: valor }));
  };

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!scriptSelecionado) return;

    let msgFiltro = 'em TODAS as lojas ativas';
    if (tipoSelecao === 'INTERVALO') msgFiltro = `nas lojas do intervalo ${lojaDe} até ${lojaAte}`;
    else if (tipoSelecao === 'LISTA') msgFiltro = `nas lojas: ${lojasIds}`;

    if (!window.confirm(`⚠️ CONFIRMAÇÃO CRÍTICA:\n\nDeseja executar "${scriptSelecionado.nome}" ${msgFiltro}?\nEsta ação não pode ser desfeita.`)) return;

    setExecutando(true);
    const payload = { script_id: scriptSelecionado.id, alvo, parametros, tipo_selecao: tipoSelecao, loja_de: lojaDe, loja_ate: lojaAte, lojas_ids: lojasIds };

    try {
      const res = await fetch(`${API}/broadcast/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setJobStatus(null);
        setAbaRelatorio('offline');
        setMonitoramentoAberto(true);
        iniciarPolling(data.job_id);
      } else {
        const err = await res.json();
        alert(err.detail || 'Erro ao disparar broadcast.');
      }
    } catch {
      alert('Erro de conexão com o servidor.');
    } finally {
      setExecutando(false);
    }
  };

  const iniciarPolling = (idJob) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/execucoes/${idJob}/status`, { headers });
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === 'concluido' || data.status === 'erro') clearInterval(pollRef.current);
        }
      } catch (err) {
        console.error('Erro no polling do broadcast:', err);
      }
    }, 1500);
  };

  // Cálculos de progresso
  const totalLojas = jobStatus?.total_lojas || 0;
  const etapas = jobStatus?.etapas || [];
  const concluidas = etapas.filter(e => e.status === 'sucesso').length;
  const falhas = etapas.filter(e => e.status === 'erro').length;
  const emAndamento = etapas.filter(e => e.status === 'rodando').length;
  const processadas = concluidas + falhas;
  const progressoPct = totalLojas > 0 ? Math.round((processadas / totalLojas) * 100) : 0;

  const etapasFiltradas = etapas.filter(e => e.nome.toLowerCase().includes(buscaLoja.toLowerCase()));

  const copiarRelatorio = () => {
    const rel = jobStatus?.relatorio;
    if (!rel) return;
    const linhas = [
      `===== RELATÓRIO BROADCAST: ${rel.script_nome} =====`,
      `Total de Lojas: ${rel.total_lojas}`,
      `Sucesso: ${rel.total_sucesso}`,
      `Offline: ${rel.total_offline}`,
      `Erros de Servidor: ${rel.total_erros_servidor}`,
      `PDVs com Erro: ${rel.total_pdvs_com_erro}`,
      '',
    ];
    if (rel.lojas_offline?.length > 0) {
      linhas.push('--- LOJAS OFFLINE / SEM CONEXAO ---');
      rel.lojas_offline.forEach(l => linhas.push(`  [${l.id}] ${l.nome} (${l.alvo}): ${l.detalhe}`));
      linhas.push('');
    }
    if (rel.lojas_erro_servidor?.length > 0) {
      linhas.push('--- ERROS NO SERVIDOR DA LOJA ---');
      rel.lojas_erro_servidor.forEach(l => linhas.push(`  [${l.id}] ${l.nome} (${l.alvo}): ${l.detalhe}`));
      linhas.push('');
    }
    if (rel.pdvs_com_erro?.length > 0) {
      linhas.push('--- PDVs / CAIXAS COM FALHA ---');
      rel.pdvs_com_erro.forEach(p => linhas.push(`  Loja [${p.loja_id}] ${p.loja_nome} | Caixa ${p.caixa} (${p.ip}): ${p.detalhe}`));
    }
    const texto = linhas.join('\n');

    // Fallback compatível com HTTP (sem HTTPS) usando execCommand
    const copiarTexto = (txt) => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(txt);
      }
      // Fallback para HTTP
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
      return Promise.resolve();
    };

    copiarTexto(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }).catch(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };


  // Helper para detectar se um erro é offline
  const isOfflineDetalhe = (detalhe) =>
    detalhe && (detalhe.toLowerCase().includes('offline') || detalhe.toLowerCase().includes('porta 1433'));

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn" onClick={() => navigate('/dashboard')} style={{ background: 'transparent', padding: '8px' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={24} color="#ef4444" /> Execução em Massa (Broadcast)
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Dispare scripts SQL consolidados em todos os Servidores e Caixas da rede de lojas.
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <form onSubmit={handleExecute}>

          {/* Seleção do Script */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Selecionar Script para Disparo</label>
            <select
              required onChange={handleScriptChange} defaultValue=""
              style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="" disabled>Escolha um script publicado...</option>
              {scripts.map(s => (
                <option key={s.id} value={s.id}>{s.nome} ({s.descricao || 'Sem descrição'})</option>
              ))}
            </select>
          </div>

          {scriptSelecionado && (
            <>
              {/* Filtro de Lojas do Broadcast */}
              <div style={{ marginBottom: '1.8rem', padding: '1.2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '10px' }}>🎯 Seleção de Lojas Destino</label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                  {[
                    { key: 'TODAS', label: 'Todas as Lojas' },
                    { key: 'INTERVALO', label: 'Intervalo de Lojas' },
                    { key: 'LISTA', label: 'Lista Específica' }
                  ].map(({ key, label }) => (
                    <button
                      key={key} type="button" onClick={() => setTipoSelecao(key)}
                      style={{
                        flex: 1, padding: '10px',
                        background: tipoSelecao === key ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.3)',
                        color: tipoSelecao === key ? '#818cf8' : '#cbd5e1',
                        border: `1px solid ${tipoSelecao === key ? '#818cf8' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', transition: 'all 0.2s'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tipoSelecao === 'INTERVALO' && (
                  <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Loja Inicial</label>
                      <input type="number" required min="1" placeholder="Ex: 50" value={lojaDe} onChange={e => setLojaDe(e.target.value)} className="form-input" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Loja Final</label>
                      <input type="number" required min="1" placeholder="Ex: 90" value={lojaAte} onChange={e => setLojaAte(e.target.value)} className="form-input" />
                    </div>
                  </div>
                )}

                {tipoSelecao === 'LISTA' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>IDs das Lojas (Separados por vírgula)</label>
                    <input type="text" required placeholder="Ex: 50, 60, 70" value={lojasIds} onChange={e => setLojasIds(e.target.value)} className="form-input" />
                  </div>
                )}
              </div>

              {/* Alvo do Disparo */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Alvo do Disparo</label>
                {scriptSelecionado.alvo_fixo ? (
                  <div style={{ padding: '12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: '14px', color: '#818cf8', fontWeight: 500 }}>
                    {scriptSelecionado.alvo_fixo === 'SERVIDOR' && '🔒 Fixado: Apenas no Servidor da Loja (Banco LOJA)'}
                    {scriptSelecionado.alvo_fixo === 'TODOS_PDVS' && '🔒 Fixado: Apenas em Todos os Caixas de cada loja (Banco PDV)'}
                    {scriptSelecionado.alvo_fixo === 'SERVIDOR_PDV' && '🔒 Fixado: No Servidor da Loja direcionado ao Banco PDV'}
                    {scriptSelecionado.alvo_fixo === 'AMBOS' && '🔒 Fixado: Servidores (LOJA) e Todos os Caixas (PDV)'}
                    {scriptSelecionado.alvo_fixo === 'PDV_ESPECIFICO' && '🔒 Convertido: Rodar em todos os Caixas da loja'}
                  </div>
                ) : (
                  <select value={alvo} onChange={e => setAlvo(e.target.value)} style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '14px' }}>
                    <option value="AMBOS">Todos os Servidores e Todos os Caixas</option>
                    <option value="TODOS_PDVS">Apenas Todos os Caixas</option>
                    <option value="SERVIDOR">Apenas os Servidores (LOJA)</option>
                    <option value="SERVIDOR_PDV">Servidores (PDV)</option>
                  </select>
                )}
              </div>

              {/* Parâmetros Dinâmicos */}
              {scriptSelecionado.parametros_exigidos?.filter(p => p !== 'caixa' && p !== 'loja' && p !== 'loja_id').length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '1.2rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '14px', color: '#cbd5e1' }}>Parâmetros do Script</h4>
                  {scriptSelecionado.parametros_exigidos.filter(p => p !== 'caixa' && p !== 'loja' && p !== 'loja_id').map(p => (
                    <div key={p} style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px', textTransform: 'capitalize' }}>{p}</label>
                      <input type="text" required value={parametros[p] || ''} onChange={e => handleParamChange(p, e.target.value)} className="form-input" placeholder={`Digite o valor de {${p}}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Caixa Alert */}
              {scriptSelecionado.parametros_exigidos?.includes('caixa') && (
                <div style={{ marginBottom: '1.5rem', padding: '12px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>Atenção: Este script utiliza a variável <strong>{'{caixa}'}</strong>. No envio em massa, o número correspondente de cada caixa/PDV é injetado automaticamente.</span>
                </div>
              )}

              {/* Warning Box */}
              <div style={{ marginBottom: '2rem', padding: '1.2rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.9rem', display: 'flex', gap: '10px' }}>
                <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.95rem' }}>⚠️ ALERTA DE SEGURANÇA CRÍTICO</strong>
                  Você está prestes a realizar um disparo global. Verifique se o SQL foi homologado anteriormente.
                  Máquinas ativas, servidores de loja e PDVs serão modificados concorrentemente.
                </div>
              </div>

              {/* Submit Button */}
              <button type="submit" className="btn" disabled={executando} style={{ width: '100%', justifyContent: 'center', background: '#ef4444', padding: '14px', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
                {executando
                  ? <><RefreshCw size={18} className="spin" style={{ marginRight: '8px' }} /> Disparando robôs na Retaguarda...</>
                  : <><Play size={18} style={{ marginRight: '8px' }} /> Confirmar e Iniciar Robô Global</>}
              </button>
            </>
          )}
        </form>
      </div>

      {/* ── MODAL BROADCAST MONITOR ── */}
      {monitoramentoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}>
          <div className="glass-panel modal-panel" style={{ padding: '1.8rem', width: '100%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>

            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px', flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
                <Radio size={20} color="#ef4444" className="blink" /> Radar Ao Vivo: Transmissão Global
              </span>
              {(jobStatus?.status === 'concluido' || jobStatus?.status === 'erro') && (
                <button onClick={() => setMonitoramentoAberto(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                  <X size={20} />
                </button>
              )}
            </div>

            {jobStatus ? (
              <>
                {/* Stats + Progresso */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem 1.2rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px', textAlign: 'center' }}>
                    {[
                      { label: 'Total', val: totalLojas, color: '#cbd5e1' },
                      { label: 'Sucesso', val: concluidas, color: '#34d399' },
                      { label: 'Falha', val: falhas, color: '#f87171' },
                      { label: 'Rodando', val: emAndamento, color: '#fbbf24' }
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <span style={{ display: 'block', fontSize: '10px', color, textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
                        <strong style={{ fontSize: '20px', color }}>{val}</strong>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '5px' }}>
                    <span>{jobStatus.status === 'rodando' ? '📡 Transmitindo...' : '🏁 Transmissão encerrada'}</span>
                    <strong style={{ color: '#818cf8' }}>{progressoPct}%</strong>
                  </div>
                  <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${progressoPct}%`, height: '100%', background: falhas > 0 ? 'linear-gradient(90deg,#6366f1,#ef4444)' : 'linear-gradient(90deg,#6366f1,#34d399)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                {/* ── FASE 1: Execução em andamento — lista ao vivo ── */}
                {jobStatus.status === 'rodando' && (
                  <>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input type="text" value={buscaLoja} onChange={e => setBuscaLoja(e.target.value)} placeholder="Filtrar lojas no radar..."
                        style={{ width: '100%', padding: '9px 10px 9px 34px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                      {buscaLoja && <button onClick={() => setBuscaLoja('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={14} /></button>}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', padding: '10px' }}>
                      {etapasFiltradas.length === 0
                        ? <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>Nenhuma loja encontrada.</div>
                        : etapasFiltradas.map((etapa, idx) => {
                            const isOff = etapa.status === 'erro' && isOfflineDetalhe(etapa.detalhe);
                            const bc = etapa.status === 'rodando' ? '#fbbf24' : etapa.status === 'sucesso' ? '#34d399' : isOff ? '#f97316' : '#ef4444';
                            return (
                              <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '9px 12px', borderRadius: '6px', borderLeft: `3px solid ${bc}`, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 500 }}>{etapa.nome}</span>
                                <span style={{ fontSize: '12px', flexShrink: 0 }}>
                                  {etapa.status === 'rodando' && <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={12} className="spin" /> Enviando</span>}
                                  {etapa.status === 'sucesso' && <span style={{ color: '#34d399', fontWeight: 600 }}>✅ OK</span>}
                                  {etapa.status === 'erro' && isOff && <span style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><WifiOff size={12} /> Offline</span>}
                                  {etapa.status === 'erro' && !isOff && <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Falha</span>}
                                </span>
                              </div>
                            );
                          })
                      }
                    </div>
                  </>
                )}

                {/* ── FASE 2: Concluído — Relatório Final ── */}
                {(jobStatus.status === 'concluido' || jobStatus.status === 'erro') && (
                  <>
                    {/* Banner resultado */}
                    <div style={{ flexShrink: 0, textAlign: 'center', fontWeight: 700, fontSize: '14px', padding: '10px 14px', borderRadius: '8px', background: falhas === 0 ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.08)', border: `1px solid ${falhas === 0 ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`, color: falhas === 0 ? '#34d399' : '#f87171' }}>
                      {falhas === 0
                        ? '🎉 Missão Cumprida! Script transmitido com sucesso em todas as lojas.'
                        : `⚠️ Transmissão encerrada com falha em ${falhas} loja(s). Confira o relatório.`}
                    </div>

                    {/* Painel relatório */}
                    {jobStatus.relatorio && (
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>

                        {/* Header relatório */}
                        <div style={{ padding: '9px 12px', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', color: '#818cf8' }}>
                            <FileText size={13} /> Relatório Final de Execução
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setAbaRelatorio(abaRelatorio === 'lista' ? 'offline' : 'lista')}
                              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px' }}
                            >
                              {abaRelatorio === 'lista' ? '← Resumo' : '📋 Ver Lojas'}
                            </button>
                            <button
                              onClick={copiarRelatorio}
                              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: copiado ? '#34d399' : '#94a3b8', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              {copiado ? <><ClipboardCheck size={12} /> Copiado!</> : <><Clipboard size={12} /> Copiar</>}
                            </button>
                          </div>
                        </div>

                        {/* Vista: Lista de lojas */}
                        {abaRelatorio === 'lista' && (
                          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                            {etapas.map((etapa, idx) => {
                              const isOff = etapa.status === 'erro' && isOfflineDetalhe(etapa.detalhe);
                              const bc = etapa.status === 'sucesso' ? '#34d399' : isOff ? '#f97316' : '#ef4444';
                              return (
                                <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '7px 10px', borderRadius: '6px', borderLeft: `3px solid ${bc}`, marginBottom: '4px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 500 }}>{etapa.nome}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: bc }}>{etapa.status === 'sucesso' ? '✅ OK' : isOff ? '📴 Offline' : '❌ Falha'}</span>
                                  </div>
                                  {etapa.detalhe && etapa.status === 'erro' && (
                                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{etapa.detalhe}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Vista: Resumo com abas */}
                        {abaRelatorio !== 'lista' && (
                          <>
                            {/* Cards de totais */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', padding: '10px 12px', flexShrink: 0 }}>
                              {[
                                { label: 'Sucesso', val: jobStatus.relatorio.total_sucesso, color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
                                { label: 'Offline', val: jobStatus.relatorio.total_offline, color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)' },
                                { label: 'Srv. Erro', val: jobStatus.relatorio.total_erros_servidor, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
                                { label: 'PDVs Erro', val: jobStatus.relatorio.total_pdvs_com_erro, color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' }
                              ].map(({ label, val, color, bg, border }) => (
                                <div key={label} style={{ textAlign: 'center', background: bg, borderRadius: '8px', padding: '8px 4px', border: `1px solid ${border}` }}>
                                  <span style={{ display: 'block', fontSize: '9px', color, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</span>
                                  <strong style={{ fontSize: '20px', color, lineHeight: 1 }}>{val}</strong>
                                </div>
                              ))}
                            </div>

                            {/* Abas de erros */}
                            {(jobStatus.relatorio.total_offline > 0 || jobStatus.relatorio.total_erros_servidor > 0 || jobStatus.relatorio.total_pdvs_com_erro > 0) ? (
                              <>
                                <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                  {[
                                    { key: 'offline', emoji: '📴', label: 'Offline', count: jobStatus.relatorio.total_offline },
                                    { key: 'servidor', emoji: '❌', label: 'Servidor', count: jobStatus.relatorio.total_erros_servidor },
                                    { key: 'pdvs', emoji: '⚠️', label: 'PDVs', count: jobStatus.relatorio.total_pdvs_com_erro }
                                  ].filter(t => t.count > 0).map(tab => (
                                    <button key={tab.key} onClick={() => setAbaRelatorio(tab.key)} style={{ flex: 1, padding: '8px 4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', background: abaRelatorio === tab.key ? 'rgba(99,102,241,0.12)' : 'transparent', color: abaRelatorio === tab.key ? '#818cf8' : '#64748b', border: 'none', borderBottom: abaRelatorio === tab.key ? '2px solid #818cf8' : '2px solid transparent', transition: 'all 0.18s' }}>
                                      {tab.emoji} {tab.label} <span style={{ opacity: 0.6 }}>({tab.count})</span>
                                    </button>
                                  ))}
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
                                  {abaRelatorio === 'offline' && jobStatus.relatorio.lojas_offline?.map((l, i) => (
                                    <div key={i} style={{ padding: '8px 10px', marginBottom: '5px', borderRadius: '7px', background: 'rgba(249,115,22,0.07)', borderLeft: '3px solid #f97316' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#fed7aa' }}>[{l.id}] {l.nome}</span>
                                        <span style={{ fontSize: '10px', color: '#78716c', background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: '4px' }}>{l.alvo}</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#fb923c', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>{l.detalhe}</div>
                                    </div>
                                  ))}
                                  {abaRelatorio === 'servidor' && jobStatus.relatorio.lojas_erro_servidor?.map((l, i) => (
                                    <div key={i} style={{ padding: '8px 10px', marginBottom: '5px', borderRadius: '7px', background: 'rgba(239,68,68,0.07)', borderLeft: '3px solid #ef4444' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#fca5a5' }}>[{l.id}] {l.nome}</span>
                                        <span style={{ fontSize: '10px', color: '#78716c', background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: '4px' }}>{l.alvo}</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#f87171', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>{l.detalhe}</div>
                                    </div>
                                  ))}
                                  {abaRelatorio === 'pdvs' && jobStatus.relatorio.pdvs_com_erro?.map((p, i) => (
                                    <div key={i} style={{ padding: '8px 10px', marginBottom: '5px', borderRadius: '7px', background: p.offline ? 'rgba(249,115,22,0.07)' : 'rgba(251,191,36,0.07)', borderLeft: `3px solid ${p.offline ? '#f97316' : '#fbbf24'}` }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: p.offline ? '#fed7aa' : '#fde68a' }}>[{p.loja_id}] {p.loja_nome}</span>
                                        <span style={{ fontSize: '10px', color: '#78716c', background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: '4px' }}>Caixa {p.caixa} · {p.ip}</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: p.offline ? '#fb923c' : '#fbbf24', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>{p.detalhe}</div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontSize: '13px', gap: '6px' }}>
                                <CheckCircle size={16} /> Nenhum erro registrado — execução perfeita!
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <button className="btn" onClick={() => setMonitoramentoAberto(false)} style={{ background: '#334155', width: '100%', justifyContent: 'center', flexShrink: 0 }}>
                      Fechar
                    </button>
                  </>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
                <RefreshCw size={28} className="spin" style={{ color: '#ef4444' }} />
                <p style={{ margin: 0, fontSize: '14px' }}>Conectando à Retaguarda para iniciar o Broadcast...</p>
              </div>
            )}

          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .blink { animation: blink 1.5s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}
