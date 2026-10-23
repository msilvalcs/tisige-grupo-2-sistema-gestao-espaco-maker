import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Box,
  LayoutDashboard,
  FolderKanban,
  Printer,
  Package,
  Users,
  LogOut,
  Plus,
  Search,
  ArrowUpRight,
  X,
  AlertCircle,
  History,
  Pencil,
  Layers3,
} from 'lucide-react';
import './styles.css';

import { api } from './lib/api.mjs';
import { number } from './lib/format.mjs';
import { Badge, Empty } from './components/ui.jsx';
import { Login } from './components/Login.jsx';
import { Records } from './components/Records.jsx';
import { Modal } from './components/Modal.jsx';
const navigation = [
  ['dashboard', 'Visão geral', LayoutDashboard],
  ['projects', 'Projetos', FolderKanban],
  ['equipment', 'Equipamentos', Printer],
  ['materials', 'Insumos', Package],
  ['users', 'Pessoas', Users],
];
function App() {
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!e.message.includes('Entre na sua conta') && !e.message.includes('expirou'))
          setError('Não foi possível conectar ao servidor. Tente novamente.');
      })
      .finally(() => setBoot(false));
    const expired = () => {
      setUser(null);
      setError('Sua sessão expirou. Entre novamente.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  if (boot)
    return (
      <div className="boot" role="status">
        Conectando ao SIGES...
      </div>
    );
  if (!user) return <Login onLogin={setUser} initialError={error} />;
  return <Workspace user={user} onLogout={() => setUser(null)} />;
}
function Workspace({ user, onLogout }) {
  const [page, setPage] = useState(() => location.hash.slice(1) || 'dashboard'),
    [data, setData] = useState({ projects: [], equipment: [], materials: [], users: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [updated, setUpdated] = useState(null),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState('');
  const manager = user.role === 'manager';
  useEffect(() => {
    const change = () => {
      setPage(location.hash.slice(1) || 'dashboard');
      setQuery('');
      setFilter('all');
      setModal(null);
      setNotice('');
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [projects, equipment, materials, users] = await Promise.all(
        ['/projects', '/equipment', '/materials', '/users'].map((path) => api(path)),
      );
      setData({ projects, equipment, materials, users });
      setUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const title = navigation.find(([key]) => key === page)?.[1] || 'Página não encontrada';
  const materialsAlert = data.materials.filter(
    (m) => m.active && Number(m.available) <= Number(m.minimum),
  );
  const activeProjects = data.projects.filter((p) => p.active).length;
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      onLogout();
    } catch (e) {
      setError(e.message);
    }
  }
  async function saved(message) {
    setModal(null);
    setNotice(message);
    await load();
  }
  const descriptions = {
    projects: 'Organize suas ideias e acompanhe os responsáveis.',
    equipment: 'Conheça a infraestrutura do laboratório.',
    materials: 'Saldos e movimentações, com rastreabilidade.',
    users: 'Quem transforma ideias em realidade.',
  };
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="#dashboard">
          <Box size={27} /> SIGES<span>ESPAÇO MAKER</span>
        </a>
        <div className="nav-heading">SEU LABORATÓRIO</div>
        <nav aria-label="Navegação principal">
          {navigation
            .filter(([key]) => key !== 'users' || manager)
            .map(([key, label, Icon]) => (
              <a
                key={key}
                href={'#' + key}
                aria-current={page === key ? 'page' : undefined}
                className={page === key ? 'active' : ''}
              >
                <Icon size={19} />
                {label}
                {page === key && <span className="nav-dot" />}
              </a>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="lab-icon">
            <Box size={20} />
          </span>
          <strong>Espaço Maker PUC Minas</strong>
          <small>Coração Eucarístico</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">SIGES</span>
            <span className="breadcrumb">/</span>
            {title}
          </div>
          <div className="account">
            <span className="avatar">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{manager ? 'Gestor do laboratório' : 'Usuário'}</small>
            </div>
            <button className="icon-button" onClick={logout} aria-label="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'dashboard' ? 'VISÃO GERAL' : 'OPERAÇÃO DO LABORATÓRIO'}
              </span>
              <h1>{page === 'dashboard' ? 'Olá, ' + user.name.split(' ')[0] + '.' : title}</h1>
              <p className="muted">
                {page === 'dashboard'
                  ? 'Tudo pronto para a sua próxima ideia.'
                  : descriptions[page]}
              </p>
            </div>
            {page !== 'dashboard' &&
              (manager || page === 'projects') &&
              navigation.some(([k]) => k === page) && (
                <button className="primary" onClick={() => setModal({ kind: page })}>
                  <Plus size={18} />
                  {
                    {
                      projects: 'Novo projeto',
                      equipment: 'Novo equipamento',
                      materials: 'Novo insumo',
                      users: 'Nova pessoa',
                    }[page]
                  }
                </button>
              )}
          </div>
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}{' '}
              <button className="text-button" onClick={load}>
                Tentar novamente
              </button>
            </div>
          )}
          {loading ? (
            <div className="panel loading" role="status">
              Carregando dados do laboratório...
            </div>
          ) : (
            !error && (
              <>
                {page === 'dashboard' ? (
                  <>
                    <div className="stats">
                      <Stat
                        label="Equipamentos ativos"
                        value={data.equipment.filter((e) => e.active).length}
                        note={'de ' + data.equipment.length + ' cadastrados'}
                        icon={Printer}
                      />
                      <Stat
                        label="Projetos ativos"
                        value={activeProjects}
                        note={manager ? 'Em todo o laboratório' : 'Sob sua responsabilidade'}
                        icon={FolderKanban}
                      />
                      <Stat
                        label="Insumos em alerta"
                        value={materialsAlert.length}
                        note="Disponível menor ou igual ao mínimo"
                        icon={AlertCircle}
                        warning={materialsAlert.length > 0}
                      />
                      <Stat
                        label="Materiais cadastrados"
                        value={data.materials.length}
                        note="Filamentos e resinas"
                        icon={Package}
                      />
                    </div>
                    <div className="dashboard-grid">
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Projetos em movimento</h2>
                            <p>Uma visão dos seus próximos protótipos.</p>
                          </div>
                          <a className="text-link" href="#projects">
                            Ver projetos <ArrowUpRight size={16} />
                          </a>
                        </div>
                        {data.projects
                          .filter((p) => p.active)
                          .slice(0, 5)
                          .map((p) => (
                            <div className="project-row" key={p.id}>
                              <span className="project-icon">
                                <FolderKanban size={21} />
                              </span>
                              <div>
                                <strong>{p.name}</strong>
                                <small>{p.owner_name}</small>
                              </div>
                              <Badge>Ativo</Badge>
                            </div>
                          ))}
                        {!activeProjects && (
                          <Empty message="Nenhum projeto ativo. Crie um projeto para começar." />
                        )}
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Atenção ao estoque</h2>
                            <p>Insumos ativos abaixo do limite ou zerados.</p>
                          </div>
                          <Package size={20} className="muted" />
                        </div>
                        {materialsAlert.slice(0, 5).map((m) => (
                          <a className="stock-row" href="#materials" key={m.id}>
                            <div>
                              <strong>{m.name}</strong>
                              <small>
                                {Number(m.available) === 0 ? 'Sem estoque' : 'Estoque baixo'}
                              </small>
                            </div>
                            <span>
                              {number(m.available)} <small>{m.unit}</small>
                            </span>
                          </a>
                        ))}
                        {!materialsAlert.length && (
                          <Empty message="Todos os insumos estão acima do limite mínimo." />
                        )}
                      </section>
                    </div>
                    <section className="next-step">
                      <span className="project-icon">
                        <Layers3 size={24} />
                      </span>
                      <div>
                        <h2>A base da sua operação</h2>
                        <p>
                          Cadastre pessoas, projetos, impressoras e materiais. Agenda, manutenção e
                          métricas serão adicionadas nas próximas entregas.
                        </p>
                      </div>
                    </section>
                  </>
                ) : (
                  <>
                    <div className="toolbar">
                      <div className="search">
                        <Search size={18} />
                        <input
                          aria-label="Buscar registros"
                          placeholder={'Buscar em ' + title.toLowerCase() + '...'}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      {page !== 'users' && (
                        <select
                          aria-label="Filtrar situação"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">Todas as situações</option>
                          <option value="active">Ativos</option>
                          <option value="inactive">Inativos</option>
                        </select>
                      )}
                    </div>
                    <section className="panel table-panel">
                      <Records
                        page={page}
                        records={(data[page] || []).filter(
                          (row) =>
                            (filter === 'all' || row.active === (filter === 'active')) &&
                            [row.name, row.code, row.model, row.owner_name, row.email]
                              .filter(Boolean)
                              .join(' ')
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )}
                        manager={manager}
                        onEdit={(item) => setModal({ kind: page, item })}
                        onMove={(item) => setModal({ kind: 'movement', item })}
                        onHistory={(item) => setModal({ kind: 'history', item })}
                      />
                    </section>
                  </>
                )}
                <footer className="content-footer">
                  <span className="connection-dot" />
                  Dados do PostgreSQL · Atualizado às {updated?.toLocaleTimeString('pt-BR')}
                  <button className="text-button" onClick={load}>
                    Atualizar
                  </button>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      {modal && (
        <Modal
          modal={modal}
          user={user}
          users={data.users}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function Stat({ label, value, note, icon: Icon, warning }) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <Icon size={19} className={warning ? 'warning-text' : 'muted'} />
      </div>
      <strong>{String(value).padStart(2, '0')}</strong>
      <small>{note}</small>
    </section>
  );
}
createRoot(document.getElementById('root')).render(<App />);
