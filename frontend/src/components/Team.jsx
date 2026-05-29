import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, KeyRound, ShieldAlert, X, Pencil, CheckCircle, XCircle, ShieldCheck, FolderPlus, ChevronRight, ChevronDown, Building, Folder, FolderOpen, Shield, GripVertical } from 'lucide-react';

const API = 'http://127.0.0.1:8080';

// ─────────────────────────────────────────────────────────────────────────────
//  TreeNode — apenas renderização + dispara onDragStart
//  Toda a lógica de move/up fica no Team (window listeners com refs)
// ─────────────────────────────────────────────────────────────────────────────
function TreeNode({
  node,
  depth,
  collapsedNodes,
  toggleNodeCollapse,
  dragVisual,          // { draggedId, dropTargetId } – só para visual
  onDragStart,         // (nodeId, nodeName, pointerId, cardElement) => void
  abrirModalGrupo,
  handleDeleteGroup,
}) {
  const permCount = node.permissoesEfetivas ? node.permissoesEfetivas.split(',').filter(Boolean).length : 0;
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = !!collapsedNodes[node.id];

  const depthColors = [
    { text: '#c084fc', icon: '#8b5cf6', badgeBg: 'rgba(139, 92, 246, 0.15)' },
    { text: '#34d399', icon: '#10b981', badgeBg: 'rgba(16, 185, 129, 0.15)' },
    { text: '#22d3ee', icon: '#06b6d4', badgeBg: 'rgba(6, 182, 212, 0.12)' },
    { text: '#fb923c', icon: '#f97316', badgeBg: 'rgba(249, 115, 22, 0.1)' },
  ];
  const cs = depthColors[Math.min(depth, depthColors.length - 1)];

  const getNodeIcon = () => {
    if (depth === 0) return <Building size={16} color={cs.icon} />;
    if (depth === 1) return isCollapsed ? <Folder size={16} color={cs.icon} /> : <FolderOpen size={16} color={cs.icon} />;
    if (depth === 2) return <Users size={16} color={cs.icon} />;
    return <Shield size={16} color={cs.icon} />;
  };

  const isProtected = node.nome === 'Administradores';
  const isDragged    = dragVisual?.draggedId === node.id;
  const isDropTarget = dragVisual?.dropTargetId === node.id;
  const isActiveDrag = !!dragVisual?.draggedId;

  const handlePointerDown = (e) => {
    if (isProtected || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart(node.id, node.nome, e.pointerId, e.currentTarget, e.clientX, e.clientY);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Card — data-group-id é lido pelo hit-test no pointermove */}
      <div
        data-group-id={node.id}
        onPointerDown={handlePointerDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: isDropTarget
            ? 'rgba(139, 92, 246, 0.25)'
            : isDragged && isActiveDrag
            ? 'rgba(30, 41, 59, 0.15)'
            : 'rgba(30, 41, 59, 0.4)',
          border: isDropTarget
            ? '2px dashed #8b5cf6'
            : '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '10px',
          marginTop: '8px',
          transition: 'background 0.15s ease, border 0.15s ease, opacity 0.15s ease',
          cursor: isProtected ? 'default' : (isDragged && isActiveDrag ? 'grabbing' : 'grab'),
          opacity: isDragged && isActiveDrag ? 0.35 : 1,
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {/* Lado Esquerdo — pointerEvents:none para não bloquear hit-test */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, pointerEvents: 'none' }}>
          {!isProtected && <GripVertical size={14} style={{ color: '#475569', flexShrink: 0 }} />}
          {hasChildren ? (
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => toggleNodeCollapse(node.id)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', pointerEvents: 'all' }}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : (
            <div style={{ width: '20px' }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center' }}>{getNodeIcon()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: cs.text }}>{node.nome}</span>
            {node.descricao && (
              <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={node.descricao}>
                • {node.descricao}
              </span>
            )}
            {permCount > 0 && (
              <span style={{ fontSize: '9px', background: cs.badgeBg, color: cs.text, padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                {permCount} perm{permCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Botões — pointerEvents:none no container, 'all' nos botões */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '12px', pointerEvents: 'none' }}>
          <button
            className="btn"
            onClick={() => abrirModalGrupo(node)}
            onPointerDown={e => e.stopPropagation()}
            style={{ padding: '4px 6px', fontSize: '11px', background: '#3b82f6', height: '24px', justifyContent: 'center', pointerEvents: 'all' }}
            title="Editar grupo" type="button"
          >
            <Pencil size={11} />
          </button>
          {node.nome !== 'TI' && node.nome !== 'Administradores' && (
            <button
              className="btn"
              onClick={() => handleDeleteGroup(node.id, node.nome)}
              onPointerDown={e => e.stopPropagation()}
              style={{ padding: '4px 6px', fontSize: '11px', background: '#ef4444', height: '24px', justifyContent: 'center', pointerEvents: 'all' }}
              title="Excluir grupo" type="button"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Filhos */}
      {hasChildren && !isCollapsed && (
        <div style={{ borderLeft: '1px dotted rgba(255,255,255,0.12)', marginLeft: '24px', paddingLeft: '16px', display: 'flex', flexDirection: 'column' }}>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedNodes={collapsedNodes}
              toggleNodeCollapse={toggleNodeCollapse}
              dragVisual={dragVisual}
              onDragStart={onDragStart}
              abrirModalGrupo={abrirModalGrupo}
              handleDeleteGroup={handleDeleteGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Team — componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function Team() {
  const [usuarios, setUsuarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [scriptsPublicados, setScriptsPublicados] = useState([]);

  const [modalPermissoesAberto, setModalPermissoesAberto] = useState(false);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
  const [permissoesAtuais, setPermissoesAtuais] = useState([]);

  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [edicaoGrupoId, setEdicaoGrupoId] = useState('');
  const [edicaoAtivo, setEdicaoAtivo] = useState(true);

  const [modalGrupoAberto, setModalGrupoAberto] = useState(false);
  const [grupoSelecionado, setGrupoSelecionado] = useState(null);
  const [nomeGrupoEdicao, setNomeGrupoEdicao] = useState('');
  const [descricaoGrupoEdicao, setDescricaoGrupoEdicao] = useState('');
  const [permissoesGrupoEdicao, setPermissoesGrupoEdicao] = useState([]);
  const [grupoParentIdEdicao, setGrupoParentIdEdicao] = useState('');

  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [grupoIdSelecionado, setGrupoIdSelecionado] = useState('');

  const [novoGrupoNome, setNovoGrupoNome] = useState('');
  const [novoGrupoDescricao, setNovoGrupoDescricao] = useState('');
  const [novoGrupoPermissoes, setNovoGrupoPermissoes] = useState([]);
  const [novoGrupoParentId, setNovoGrupoParentId] = useState('');

  const [collapsedNodes, setCollapsedNodes] = useState({});
  const toggleNodeCollapse = (nodeId) => setCollapsedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

  // ── Estado visual do drag (só para renderização) ───────────────────────────
  // { draggedId: number, dropTargetId: number | null }
  const [dragVisual, setDragVisual] = useState(null);

  // ── Refs com valores sempre atuais (sem stale closures) ───────────────────
  // dragRef.current = { draggedId, isDragging, dropTargetId }
  const dragRef    = useRef(null);
  const gruposRef  = useRef(grupos);
  const ghostRef   = useRef(null);

  useEffect(() => { gruposRef.current = grupos; }, [grupos]);

  const navigate = useNavigate();
  const token = () => localStorage.getItem('token');

  const SISTEM_PERMISSIONS = [
    { key: 'VER_DASHBOARD',       label: 'Painel Central',        desc: 'Visualizar Dashboard' },
    { key: 'EXECUTAR_SCRIPT',     label: 'Executar Scripts',       desc: 'Rodar scripts SQL pontuais nas lojas individualmente' },
    { key: 'GERENCIAR_COFRE',     label: 'Gerenciar Cofre SQL',    desc: 'Criar, editar e excluir scripts' },
    { key: 'GERENCIAR_AUDITORIA', label: 'Gerenciar Auditoria',    desc: 'Criar e alterar regras fiscais' },
    { key: 'VER_LOGS',            label: 'Visualizar Logs',        desc: 'Ver histórico completo de auditoria de disparos' },
    { key: 'EXECUTAR_BROADCAST',  label: 'Disparar Broadcast',     desc: 'Executar scripts em lote em todas as lojas' },
    { key: 'GERENCIAR_EQUIPE',    label: 'Gerenciar Equipe e RBAC',desc: 'Criar usuários e editar grupos' },
  ];

  const loadData = useCallback(() => {
    const h = { 
      Authorization: `Bearer ${token()}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    const t = Date.now();
    fetch(`${API}/api/usuarios/?_t=${t}`, { headers: h })
      .then(r => r.json()).then(d => setUsuarios(Array.isArray(d) ? d : [])).catch(() => setUsuarios([]));
    fetch(`${API}/api/usuarios/grupos/?_t=${t}`, { headers: h })
      .then(r => r.json()).then(d => {
        if (Array.isArray(d)) { setGrupos(d); if (d.length > 0) setGrupoIdSelecionado(prev => prev || String(d[0].id)); }
        else setGrupos([]);
      }).catch(() => setGrupos([]));
    fetch(`${API}/api/scripts/?apenas_publicados=true&_t=${t}`, { headers: h })
      .then(r => r.json()).then(d => setScriptsPublicados(Array.isArray(d) ? d : [])).catch(() => setScriptsPublicados([]));
  }, []);

  useEffect(() => {
    const role  = localStorage.getItem('role');
    const perms = localStorage.getItem('permissions') || '';
    if (role !== 'TI' && role !== 'Administradores' && role !== 'Admin' && !perms.includes('GERENCIAR_EQUIPE')) {
      alert('Acesso Negado: Apenas Administradores podem gerenciar equipe.');
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [navigate, loadData]);

  // ── Helper: isDescendant (estável via gruposRef) ───────────────────────────
  const isDescendantRef = useCallback((childId, parentId) => {
    if (!childId || !parentId) return false;
    const cId = Number(childId);
    const pId = Number(parentId);
    const list = gruposRef.current;
    let current = list.find(g => Number(g.id) === cId);
    while (current && current.parent_id) {
      const currentParentId = Number(current.parent_id);
      if (currentParentId === pId) return true;
      current = list.find(g => Number(g.id) === currentParentId);
    }
    return false;
  }, []);

  // ── Lógica de drag: window listeners com refs → sem stale closures ─────────
  const startDrag = useCallback((nodeId, nodeName, pointerId, cardEl, clientX, clientY) => {
    dragRef.current = { draggedId: nodeId, isDragging: false, dropTargetId: null };
    setDragVisual({ draggedId: nodeId, dropTargetId: null });

    if (ghostRef.current) {
      ghostRef.current.textContent = '📦 ' + nodeName;
      ghostRef.current.style.left  = clientX + 14 + 'px';
      ghostRef.current.style.top   = clientY - 12 + 'px';
      ghostRef.current.style.display = 'block';
    }
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;

      d.isDragging = true;

      // Move o ghost
      if (ghostRef.current) {
        ghostRef.current.style.left = e.clientX + 14 + 'px';
        ghostRef.current.style.top  = e.clientY - 12 + 'px';
      }

      // Hit-test: encontra o elemento sob o cursor (ghost tem pointerEvents:none)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      let target = el;
      while (target && !target.dataset?.groupId) target = target.parentElement;

      let newTarget = null;
      if (target?.dataset?.groupId) {
        const raw = target.dataset.groupId;
        if (raw === 'root') {
          newTarget = -1;
        } else {
          const hId = parseInt(raw);
          if (hId !== d.draggedId && !isDescendantRef(hId, d.draggedId)) {
            newTarget = hId;
          }
        }
      }

      if (newTarget !== d.dropTargetId) {
        d.dropTargetId = newTarget;
        console.log(`[DRAG] Alvo detectado sob o mouse: ${newTarget === -1 ? 'Raiz' : 'Grupo ID ' + newTarget}`);
        setDragVisual({ draggedId: d.draggedId, dropTargetId: newTarget });
      }
    };

    const onUp = async (e) => {
      const d = dragRef.current;
      if (!d) return;

      const { draggedId, dropTargetId } = d;
      console.log(`[DROP] Soltou grupo ID ${draggedId} sobre o alvo: ${dropTargetId === null ? 'Nenhum' : (dropTargetId === -1 ? 'Raiz' : 'Grupo ID ' + dropTargetId)}`);

      // Limpa estado imediatamente
      dragRef.current = null;
      setDragVisual(null);
      if (ghostRef.current) ghostRef.current.style.display = 'none';

      if (dropTargetId === null) return;
      if (draggedId === dropTargetId) return;
      if (dropTargetId !== -1 && isDescendantRef(dropTargetId, draggedId)) return;

      const list = gruposRef.current;
      const draggedGroup = list.find(g => g.id === draggedId);
      if (!draggedGroup) return;

      const newParentId = dropTargetId === -1 ? null : dropTargetId;
      console.log(`[API PUT] Movendo grupo "${draggedGroup.nome}" (ID ${draggedId}) para o pai ID ${newParentId}`);

      try {
        const res = await fetch(`${API}/api/usuarios/grupos/${draggedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({
            nome: draggedGroup.nome,
            descricao: draggedGroup.descricao,
            permissoes: draggedGroup.permissoes,
            parent_id: newParentId,
          }),
        });
        if (res.ok) {
          console.log('[API PUT] Sucesso ao atualizar grupo!');
          loadData();
        } else {
          const data = await res.json();
          alert('Erro ao mover grupo: ' + (data.detail || 'desconhecido'));
        }
      } catch (err) {
        console.error('[API PUT] Falha na requisição:', err);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [isDescendantRef, loadData]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const gId = parseInt(grupoIdSelecionado);
    const g   = grupos.find(g => g.id === gId);
    const res = await fetch(`${API}/api/usuarios/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ email: novoEmail, senha: novaSenha, role: g ? g.nome : 'Suporte', grupo_id: gId }),
    });
    if (res.ok) { alert('Membro criado com sucesso!'); setNovoEmail(''); setNovaSenha(''); loadData(); }
    else { const d = await res.json(); alert('Erro ao cadastrar: ' + d.detail); }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!novoGrupoNome.trim()) return;
    const res = await fetch(`${API}/api/usuarios/grupos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ nome: novoGrupoNome.trim(), descricao: novoGrupoDescricao.trim(), permissoes: novoGrupoPermissoes.join(','), parent_id: novoGrupoParentId ? parseInt(novoGrupoParentId) : null }),
    });
    if (res.ok) { alert('Grupo criado!'); setNovoGrupoNome(''); setNovoGrupoDescricao(''); setNovoGrupoPermissoes([]); setNovoGrupoParentId(''); loadData(); }
    else { const d = await res.json(); alert('Erro: ' + d.detail); }
  };

  const handleDeleteGroup = async (id, nome) => {
    if (nome === 'TI' || nome === 'Administradores') { alert('Esse grupo não pode ser excluído.'); return; }
    if (!window.confirm(`Excluir o grupo "${nome}"?`)) return;
    const res = await fetch(`${API}/api/usuarios/grupos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { alert('Grupo excluído!'); loadData(); }
    else { const d = await res.json(); alert('Erro: ' + d.detail); }
  };

  const handleResetPassword = async (id, email) => {
    if (!window.confirm(`Redefinir a senha de ${email} para 'mudar123'?`)) return;
    const res = await fetch(`${API}/api/usuarios/${id}/resetar_senha`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { alert('Senha redefinida! No próximo login ele será obrigado a trocar.'); loadData(); }
  };

  const abrirModalEdicao = (user) => { setUsuarioSelecionado(user); setEdicaoGrupoId(user.grupo_id || ''); setEdicaoAtivo(user.ativo); setModalEdicaoAberto(true); };

  const salvarEdicaoUsuario = async () => {
    if (!edicaoGrupoId) { alert('Selecione um grupo.'); return; }
    const gId = parseInt(edicaoGrupoId);
    const g   = grupos.find(g => g.id === gId);
    const res = await fetch(`${API}/api/usuarios/${usuarioSelecionado.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ role: g ? g.nome : 'Suporte', grupo_id: gId, ativo: edicaoAtivo }),
    });
    if (res.ok) { alert('Membro atualizado!'); setModalEdicaoAberto(false); loadData(); }
    else { const d = await res.json(); alert('Erro: ' + d.detail); }
  };

  const abrirModalGrupo = (grupo) => {
    setGrupoSelecionado(grupo);
    setNomeGrupoEdicao(grupo.nome);
    setDescricaoGrupoEdicao(grupo.descricao || '');
    setPermissoesGrupoEdicao(grupo.permissoes ? grupo.permissoes.split(',') : []);
    setGrupoParentIdEdicao(grupo.parent_id != null ? String(grupo.parent_id) : '');
    setModalGrupoAberto(true);
  };

  const salvarEdicaoGrupo = async () => {
    const res = await fetch(`${API}/api/usuarios/grupos/${grupoSelecionado.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ nome: nomeGrupoEdicao.trim(), descricao: descricaoGrupoEdicao.trim(), permissoes: permissoesGrupoEdicao.join(','), parent_id: grupoParentIdEdicao ? parseInt(grupoParentIdEdicao) : null }),
    });
    if (res.ok) { alert('Grupo atualizado!'); setModalGrupoAberto(false); loadData(); }
    else { const d = await res.json(); alert('Erro: ' + d.detail); }
  };

  const abrirModalPermissoes = async (user) => {
    setUsuarioSelecionado(user);
    try {
      const res  = await fetch(`${API}/api/usuarios/${user.id}/permissoes`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setPermissoesAtuais(Array.isArray(data) ? data : []);
      setModalPermissoesAberto(true);
    } catch { alert('Erro ao buscar permissões.'); }
  };

  const salvarPermissoesScripts = async () => {
    const res = await fetch(`${API}/api/usuarios/${usuarioSelecionado.id}/permissoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ script_ids: permissoesAtuais }),
    });
    if (res.ok) { alert('Permissões salvas!'); setModalPermissoesAberto(false); }
  };

  // ── Helpers visuais ────────────────────────────────────────────────────────
  const isDescendant = (childId, parentId) => {
    if (!childId || !parentId) return false;
    const cId = Number(childId);
    const pId = Number(parentId);
    let current = grupos.find(g => Number(g.id) === cId);
    while (current && current.parent_id) {
      const currentParentId = Number(current.parent_id);
      if (currentParentId === pId) return true;
      current = grupos.find(g => Number(g.id) === currentParentId);
    }
    return false;
  };

  const obterPermissoesHerdadas = useCallback((parentId) => {
    if (!parentId) return [];
    const pId = Number(parentId);
    const parentGroup = grupos.find(g => Number(g.id) === pId);
    if (!parentGroup) return [];
    
    const parentPerms = parentGroup.permissoes ? parentGroup.permissoes.split(',').filter(Boolean) : [];
    const ancestralPerms = obterPermissoesHerdadas(parentGroup.parent_id);
    return Array.from(new Set([...parentPerms, ...ancestralPerms]));
  }, [grupos]);

  const obterPermissoesEfetivasGrupo = useCallback((grupoId, list) => {
    const gId = Number(grupoId);
    const grupo = list.find(g => Number(g.id) === gId);
    if (!grupo) return [];
    const proprias = grupo.permissoes ? grupo.permissoes.split(',').filter(Boolean) : [];
    if (!grupo.parent_id) return proprias;
    const herdadas = obterPermissoesEfetivasGrupo(Number(grupo.parent_id), list);
    return Array.from(new Set([...proprias, ...herdadas]));
  }, []);

  const getBadgeColors = (groupName) => {
    const n = String(groupName).toUpperCase();
    if (n.includes('TI') || n.includes('ADMIN')) return { bg: 'rgba(139, 92, 246, 0.2)', text: '#c084fc', border: '#a78bfa' };
    if (n.includes('DEV') || n.includes('DESENVOLV')) return { bg: 'rgba(6, 182, 212, 0.2)', text: '#22d3ee', border: '#06b6d4' };
    if (n.includes('N2')) return { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399', border: '#10b981' };
    if (n.includes('N1')) return { bg: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8', border: '#475569' };
    return { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: '#4f46e5' };
  };

  const buildGroupTree = (list) => {
    const map = {};
    const roots = [];
    list.forEach(g => { 
      const gId = Number(g.id);
      const parentId = g.parent_id ? Number(g.parent_id) : null;
      const efetivas = obterPermissoesEfetivasGrupo(gId, list);
      map[gId] = { ...g, id: gId, parent_id: parentId, permissoesEfetivas: efetivas.join(','), children: [] }; 
    });
    list.forEach(g => {
      const gId = Number(g.id);
      const parentId = g.parent_id ? Number(g.parent_id) : null;
      if (parentId && map[parentId]) {
        map[parentId].children.push(map[gId]);
      } else {
        roots.push(map[gId]);
      }
    });
    return roots;
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', marginTop: '6px', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid rgba(255,255,255,0.15)', outline: 'none', boxSizing: 'border-box', fontSize: '13px',
  };

  const treeRoots    = buildGroupTree(grupos);
  console.log("[TREE] Árvore gerada:", JSON.stringify(treeRoots.map(r => ({
    id: r.id,
    nome: r.nome,
    children: (r.children || []).map(c => ({ id: c.id, nome: c.nome }))
  }))));
  const isActiveDrag = !!dragVisual?.draggedId;

  return (
    <div>
      {/* Ghost: pointerEvents:none é essencial para não bloquear elementFromPoint */}
      <div
        ref={ghostRef}
        style={{
          display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          background: 'rgba(139, 92, 246, 0.92)', color: 'white',
          padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(10px)', whiteSpace: 'nowrap',
        }}
      />

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Users size={32} color="#818cf8" />
          <div>
            <h2 style={{ margin: 0 }}>Gestão de Equipe e Permissões</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Crie colaboradores, controle status de acesso e defina grupos de permissões dinâmicos (RBAC).
            </p>
          </div>
        </div>
      </div>

      {/* ══ SEÇÃO 1: MEMBROS ══════════════════════════════════════════════════ */}
      <div style={{ marginBottom: '4rem' }}>
        <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', marginBottom: '1.5rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 600 }}>
          <Users size={20} /> Membros da Equipe
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content' }}>
            <h4 style={{ marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', color: '#cbd5e1' }}>
              <UserPlus size={18} color="#818cf8" /> Novo Membro
            </h4>
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>E-mail corporativo</label>
                <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} required style={inputStyle} placeholder="Ex: usuario@empresa.com" />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Senha Provisória</label>
                <input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required style={inputStyle} placeholder="Ex: Senha@123" />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Grupo de Permissão</label>
                <select value={grupoIdSelecionado} onChange={e => setGrupoIdSelecionado(e.target.value)} style={inputStyle}>
                  {grupos.map(g => <option key={g.id} value={g.id} style={{ background: '#1e293b', color: 'white' }}>{g.nome}</option>)}
                  {grupos.length === 0 && <option value="" disabled style={{ background: '#1e293b', color: 'white' }}>Nenhum grupo carregado</option>}
                </select>
              </div>
              <button className="btn" type="submit" style={{ width: '100%', justifyContent: 'center' }}>Cadastrar Usuário</button>
            </form>
          </div>

          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem', color: '#cbd5e1' }}>Membros Cadastrados</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', fontSize: '13px' }}>
                    <th style={{ padding: '12px 10px' }}>Membro</th>
                    <th style={{ padding: '12px 10px' }}>Grupo / Perfil</th>
                    <th style={{ padding: '12px 10px' }}>Status</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => {
                    const gu    = grupos.find(g => Number(g.id) === Number(u.grupo_id));
                    const gNome = gu ? gu.nome : (u.role === 'Admin' ? 'Administradores' : 'Suporte');
                    const badge = getBadgeColors(gNome);
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: u.ativo ? 1 : 0.5 }}>
                        <td style={{ padding: '14px 10px', verticalAlign: 'middle' }}>
                          <span style={{ fontWeight: 500, color: u.ativo ? 'white' : '#94a3b8' }}>{u.email}</span>
                        </td>
                        <td style={{ padding: '14px 10px', verticalAlign: 'middle' }}>
                          <span style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`, padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>{gNome}</span>
                        </td>
                        <td style={{ padding: '14px 10px', verticalAlign: 'middle' }}>
                          {u.ativo
                            ? <span style={{ color: '#34d399', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><CheckCircle size={13} /> Ativo</span>
                            : <span style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}><XCircle size={13} /> Inativo</span>
                          }
                          {u.exige_troca_senha && u.ativo && <span style={{ color: '#fbbf24', fontSize: '10px', display: 'block', marginTop: '3px' }}>⚠️ Exige troca de senha</span>}
                        </td>
                        <td style={{ padding: '14px 10px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => abrirModalEdicao(u)} className="btn" style={{ padding: '6px 10px', fontSize: '0.78rem', background: '#2563eb' }}><Pencil size={13} /> Editar</button>
                            <button onClick={() => abrirModalPermissoes(u)} className="btn" style={{ padding: '6px 10px', fontSize: '0.78rem', background: '#7c3aed' }}><ShieldCheck size={13} /> Scripts</button>
                            <button onClick={() => handleResetPassword(u.id, u.email)} className="btn" style={{ padding: '6px 10px', fontSize: '0.78rem', background: '#475569' }}><KeyRound size={13} /> Senha</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ══ SEÇÃO 2: RBAC ═════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', marginBottom: '1.5rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 600 }}>
          <ShieldCheck size={20} color="#10b981" /> Grupos de Acesso (RBAC)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '2rem' }}>
          {/* Formulário Novo Grupo */}
          <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content' }}>
            <h4 style={{ marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', color: '#cbd5e1' }}>
              <FolderPlus size={18} color="#10b981" /> Novo Grupo
            </h4>
            <form onSubmit={handleCreateGroup}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Nome do Setor / Grupo</label>
                <input type="text" value={novoGrupoNome} onChange={e => setNovoGrupoNome(e.target.value)} required style={inputStyle} placeholder="Ex: Financeiro" />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Descrição / Função</label>
                <input type="text" value={novoGrupoDescricao} onChange={e => setNovoGrupoDescricao(e.target.value)} style={inputStyle} placeholder="Ex: Acesso a relatórios" />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>Grupo Superior / Pai (Opcional)</label>
                <select value={novoGrupoParentId} onChange={e => setNovoGrupoParentId(e.target.value)} style={inputStyle}>
                  <option value="" style={{ background: '#1e293b', color: '#94a3b8' }}>-- Nenhum (Grupo Raiz) --</option>
                  {grupos.map(g => <option key={g.id} value={g.id} style={{ background: '#1e293b', color: 'white' }}>{g.nome}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Chaves de Acesso</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                  {SISTEM_PERMISSIONS.map(p => {
                    const herdada = obterPermissoesHerdadas(novoGrupoParentId).includes(p.key);
                    const marcada = herdada || novoGrupoPermissoes.includes(p.key);
                    return (
                      <div key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
                        <input
                          type="checkbox"
                          id={`new_g_${p.key}`}
                          checked={marcada}
                          disabled={herdada}
                          onChange={() => setNovoGrupoPermissoes(prev => prev.includes(p.key) ? prev.filter(x => x !== p.key) : [...prev, p.key])}
                          style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                        />
                        <label htmlFor={`new_g_${p.key}`} style={{ cursor: 'pointer', fontSize: '12px' }}>
                          <strong style={{ display: 'block', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {p.label}
                            {herdada && (
                              <span style={{ fontSize: '9px', background: 'rgba(139, 92, 246, 0.25)', color: '#c084fc', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                Herdada do Pai
                              </span>
                            )}
                          </strong>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{p.desc}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button className="btn" type="submit" style={{ width: '100%', justifyContent: 'center', background: '#10b981' }}>Criar Grupo de Acesso</button>
            </form>
          </div>

          {/* Árvore */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', color: '#cbd5e1' }}>
              Hierarquia de Grupos de Acesso
            </h4>
            <p style={{ fontSize: '12px', color: '#475569', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GripVertical size={12} /> Segure e arraste um grupo para reorganizar a hierarquia
            </p>

            {/* Zona de Drop para raiz — data-group-id="root" */}
            {isActiveDrag && (
              <div
                data-group-id="root"
                style={{
                  border: `2px dashed ${dragVisual?.dropTargetId === -1 ? '#8b5cf6' : 'rgba(255,255,255,0.2)'}`,
                  background: dragVisual?.dropTargetId === -1 ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                  borderRadius: '10px', padding: '12px', textAlign: 'center', fontSize: '12px',
                  color: dragVisual?.dropTargetId === -1 ? '#c084fc' : '#475569',
                  marginBottom: '12px', transition: 'all 0.15s ease', pointerEvents: 'auto',
                }}
              >
                ➕ Solte aqui para tornar Grupo Raiz (nível 0)
              </div>
            )}

            {grupos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '13px' }}>
                Nenhum grupo criado ainda. Crie o primeiro grupo ao lado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {treeRoots.map(rootNode => (
                  <TreeNode
                    key={rootNode.id}
                    node={rootNode}
                    depth={0}
                    collapsedNodes={collapsedNodes}
                    toggleNodeCollapse={toggleNodeCollapse}
                    dragVisual={dragVisual}
                    onDragStart={startDrag}
                    abrirModalGrupo={abrirModalGrupo}
                    handleDeleteGroup={handleDeleteGroup}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ Modal Edição de Usuário ════════════════════════════════════════════ */}
      {modalEdicaoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel modal-panel" style={{ padding: '2rem', width: '420px', position: 'relative' }}>
            <button onClick={() => setModalEdicaoAberto(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Pencil size={18} color="#3b82f6" /> Editar Usuário</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{usuarioSelecionado?.email}</p>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: 500 }}>Grupo de Acesso</label>
              <select value={edicaoGrupoId} onChange={e => setEdicaoGrupoId(e.target.value)} style={inputStyle}>
                <option value="" disabled style={{ background: '#1e293b', color: '#94a3b8' }}>-- Selecione --</option>
                {grupos.map(g => <option key={g.id} value={g.id} style={{ background: '#1e293b', color: 'white' }}>{g.nome}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.9rem', fontWeight: 500 }}>Status</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setEdicaoAtivo(true)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${edicaoAtivo ? '#34d399' : 'rgba(255,255,255,0.1)'}`, background: edicaoAtivo ? 'rgba(52,211,153,0.15)' : 'rgba(0,0,0,0.2)', color: edicaoAtivo ? '#34d399' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
                  <CheckCircle size={16} /> Ativo
                </button>
                <button type="button" onClick={() => setEdicaoAtivo(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${!edicaoAtivo ? '#ef4444' : 'rgba(255,255,255,0.1)'}`, background: !edicaoAtivo ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.2)', color: !edicaoAtivo ? '#ef4444' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
                  <XCircle size={16} /> Inativo
                </button>
              </div>
            </div>
            <button className="btn" onClick={salvarEdicaoUsuario} style={{ width: '100%', justifyContent: 'center', background: '#3b82f6' }}>Salvar Alterações</button>
          </div>
        </div>
      )}

      {/* ══ Modal Edição de Grupo ══════════════════════════════════════════════ */}
      {modalGrupoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel modal-panel" style={{ padding: '2rem', width: '480px', position: 'relative' }}>
            <button onClick={() => setModalGrupoAberto(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={20} color="#3b82f6" /> Configurar Grupo: {grupoSelecionado?.nome}</h3>
            <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>Nome do Grupo</label>
              <input type="text" value={nomeGrupoEdicao} onChange={e => setNomeGrupoEdicao(e.target.value)} disabled={grupoSelecionado?.nome === 'TI' || grupoSelecionado?.nome === 'Administradores'} required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>Descrição / Setor</label>
              <input type="text" value={descricaoGrupoEdicao} onChange={e => setDescricaoGrupoEdicao(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>Grupo Superior / Pai</label>
              <select value={grupoParentIdEdicao} onChange={e => setGrupoParentIdEdicao(e.target.value)} style={inputStyle} disabled={grupoSelecionado?.nome === 'TI' || grupoSelecionado?.nome === 'Administradores'}>
                <option value="" style={{ background: '#1e293b', color: '#94a3b8' }}>-- Nenhum (Grupo Raiz) --</option>
                {grupos.filter(g => g.id !== grupoSelecionado?.id && !isDescendant(g.id, grupoSelecionado?.id)).map(g => (
                  <option key={g.id} value={g.id} style={{ background: '#1e293b', color: 'white' }}>{g.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '1.8rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Configurar Permissões</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                {SISTEM_PERMISSIONS.map(p => {
                  const herdada = obterPermissoesHerdadas(grupoParentIdEdicao).includes(p.key);
                  const marcada = herdada || permissoesGrupoEdicao.includes(p.key);
                  const isProtectedGroup = grupoSelecionado?.nome === 'TI' || grupoSelecionado?.nome === 'Administradores';
                  return (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
                      <input
                        type="checkbox"
                        id={`edit_g_${p.key}`}
                        checked={marcada}
                        disabled={herdada || isProtectedGroup}
                        onChange={() => setPermissoesGrupoEdicao(prev => prev.includes(p.key) ? prev.filter(x => x !== p.key) : [...prev, p.key])}
                        style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
                      />
                      <label htmlFor={`edit_g_${p.key}`} style={{ cursor: 'pointer', fontSize: '12px' }}>
                        <strong style={{ display: 'block', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {p.label}
                          {herdada && (
                            <span style={{ fontSize: '9px', background: 'rgba(139, 92, 246, 0.25)', color: '#c084fc', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                              Herdada do Pai
                            </span>
                          )}
                        </strong>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>{p.desc}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn" onClick={salvarEdicaoGrupo} style={{ width: '100%', justifyContent: 'center', background: '#3b82f6' }}>Salvar Configuração do Grupo</button>
          </div>
        </div>
      )}

      {/* ══ Modal Permissões de Scripts ════════════════════════════════════════ */}
      {modalPermissoesAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel modal-panel" style={{ padding: '2rem', width: '450px', position: 'relative' }}>
            <button onClick={() => setModalPermissoesAberto(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            <h3 style={{ marginTop: 0 }}>Permissões de {usuarioSelecionado?.email}</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Selecione os scripts do cofre que este usuário pode executar nas lojas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '2rem', maxHeight: '300px', overflowY: 'auto' }}>
              {scriptsPublicados.map(script => (
                <div key={script.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <input type="checkbox" checked={permissoesAtuais.includes(script.id)} onChange={() => setPermissoesAtuais(prev => prev.includes(script.id) ? prev.filter(id => id !== script.id) : [...prev, script.id])} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                  <label style={{ fontSize: '13px' }}>
                    <strong style={{ display: 'block', color: 'white' }}>{script.nome}</strong>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{script.descricao || 'Sem descrição'}</span>
                  </label>
                </div>
              ))}
              {scriptsPublicados.length === 0 && <p style={{ color: '#94a3b8' }}>Nenhum script publicado encontrado.</p>}
            </div>
            <button className="btn" onClick={salvarPermissoesScripts} style={{ width: '100%', justifyContent: 'center', background: '#10b981' }}>Salvar Permissões de Script</button>
          </div>
        </div>
      )}
    </div>
  );
}
