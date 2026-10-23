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
  CalendarDays,
  Wrench,
  BarChart3,
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
  ['bookings', 'Agendamentos', CalendarDays],
  ['maintenance', 'Manutenção', Wrench],
  ['metrics', 'Métricas', BarChart3],
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
    [data, setData] = useState({
      projects: [],
      equipment: [],
      materials: [],
      users: [],
      bookings: [],
      maintenance: [],
      dashboard: null,
      metrics: null,
    }),
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
      const [projects, equipment, materials, users, extra] = await Promise.all([
        ...['/projects', '/equipment', '/materials', '/users'].map((path) => api(path)),
        api(
          page === 'dashboard'
            ? '/dashboard'
            : page === 'bookings'
              ? '/bookings/mine'
              : page === 'maintenance'
                ? '/maintenance'
                : page === 'metrics'
                  ? '/metrics'
                  : '/dashboard',
        ),
      ]);
      setData((current) => ({
        ...current,
        projects,
        equipment,
        materials,
        users,
        dashboard: page === 'dashboard' ? extra : current.dashboard,
        bookings: page === 'bookings' ? extra : current.bookings,
        maintenance: page === 'maintenance' ? extra : current.maintenance,
        metrics: page === 'metrics' ? extra : current.metrics,
      }));
      setUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [page]);
  const title = navigation.find(([key]) => key === page)?.[1] || 'Página não encontrada';
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
    bookings: 'Reserve equipamentos com disponibilidade e consumo rastreáveis.',
    maintenance: 'Acompanhe a manutenção preventiva dos equipamentos.',
    metrics: 'Indicadores operacionais derivados dos registros do laboratório.',
    users: 'Quem transforma ideias em realidade.',
  };
  function newBooking() {
    if (page !== 'bookings') {
      location.hash = 'bookings';
      window.setTimeout(() => setModal({ kind: 'booking' }), 0);
    } else setModal({ kind: 'booking' });
  }
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
            {(page === 'dashboard' || page === 'bookings' || page === 'maintenance' || page === 'projects' || page === 'equipment' || page === 'materials' || page === 'users') &&
              (page === 'dashboard' || manager || page === 'projects' || page === 'bookings') &&
              navigation.some(([k]) => k === page) && (
                <button className="primary" onClick={page === 'dashboard' ? newBooking : () => setModal({ kind: page })}>
                  <Plus size={18} />
                  {page === 'dashboard'
                    ? 'Novo agendamento'
                    : {
                        projects: 'Novo projeto',
                        equipment: 'Novo equipamento',
                        materials: 'Novo insumo',
                        bookings: 'Novo agendamento',
                        maintenance: 'Registrar manutenção',
                        users: 'Nova pessoa',
                      }[page]}
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
                  <Dashboard data={data} onBooking={newBooking} />
                ) : page === 'bookings' ? (
                  <Bookings records={data.bookings} onCancel={(item) => setModal({ kind: 'cancel-booking', item })} />
                ) : page === 'maintenance' ? (
                  <Maintenance records={data.maintenance} />
                ) : page === 'metrics' ? (
                  <Metrics data={data.metrics} />
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
          projects={data.projects}
          equipment={data.equipment}
          materials={data.materials}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function Dashboard({ data }) {
  const dashboard = data.dashboard || {
    bookings_today: 0,
    materials_alert: 0,
    active_equipment: 0,
    active_projects: 0,
    today_bookings: [],
    stock_alerts: [],
  };
  return (
    <>
      <div className="stats">
        <Stat
          label="Equipamentos ativos"
          value={dashboard.active_equipment}
          note={'de ' + data.equipment.length + ' cadastrados'}
          icon={Printer}
        />
        <Stat
          label="Agendamentos hoje"
          value={dashboard.bookings_today}
          note="Agenda do laboratório"
          icon={CalendarDays}
        />
        <Stat
          label="Insumos em alerta"
          value={dashboard.materials_alert}
          note="Disponível menor ou igual ao mínimo"
          icon={AlertCircle}
          warning={dashboard.materials_alert > 0}
        />
        <Stat
          label="Projetos ativos"
          value={dashboard.active_projects}
          note="Projetos em andamento"
          icon={FolderKanban}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Agenda de hoje</h2>
              <p>Reservas e responsáveis em tempo real.</p>
            </div>
            <CalendarDays size={20} className="muted" />
          </div>
          {dashboard.today_bookings.map((booking) => (
            <div className="project-row" key={booking.id}>
              <span className="project-icon"><CalendarDays size={21} /></span>
              <div>
                <strong>{formatTime(booking.started_at)} · {booking.equipment_code}</strong>
                <small>{booking.user_name} · {booking.project_name}</small>
              </div>
              <BookingBadge status={booking.status} />
            </div>
          ))}
          {!dashboard.today_bookings.length && <Empty message="Nenhum agendamento para hoje." />}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Atenção ao estoque</h2>
              <p>Insumos ativos abaixo do limite ou zerados.</p>
            </div>
            <Package size={20} className="muted" />
          </div>
          {dashboard.stock_alerts.map((material) => (
            <a className="stock-row" href="#materials" key={material.id}>
              <div>
                <strong>{material.name}</strong>
                <small>{Number(material.available) === 0 ? 'Sem estoque' : 'Estoque baixo'}</small>
              </div>
              <span>{number(material.available)} <small>{material.unit}</small></span>
            </a>
          ))}
          {!dashboard.stock_alerts.length && <Empty message="Todos os insumos estão acima do limite mínimo." />}
        </section>
      </div>
    </>
  );
}
function Bookings({ records, onCancel }) {
  if (!records.length) return <section className="panel"><Empty message="Você ainda não possui agendamentos." /></section>;
  return (
    <section className="panel table-panel">
      <div className="table-scroll">
        <table>
          <thead><tr><th>Equipamento</th><th>Projeto</th><th>Início</th><th>Duração</th><th>Material</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{records.map((booking) => (
            <tr key={booking.id}>
              <td><strong>{booking.equipment_code}</strong><small>{booking.equipment_model}</small></td>
              <td>{booking.project_name}</td>
              <td>{formatDateTime(booking.started_at)}</td>
              <td>{booking.duration_min} min</td>
              <td>{number(booking.material_grams)} {booking.material_unit}</td>
              <td><BookingBadge status={booking.status} /></td>
              <td>{['scheduled', 'confirmed'].includes(booking.status) && <button className="secondary small-button" onClick={() => onCancel(booking)}>Cancelar</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
function Maintenance({ records }) {
  if (!records.length) return <section className="panel"><Empty message="Nenhum registro de manutenção encontrado." /></section>;
  return (
    <section className="panel table-panel"><div className="table-scroll"><table>
      <thead><tr><th>Equipamento</th><th>Realização</th><th>Próxima prevista</th><th>Descrição</th><th>Status</th></tr></thead>
      <tbody>{records.map((item) => <tr key={item.id}>
        <td><strong>{item.equipment_code}</strong><small>{item.equipment_model}</small></td>
        <td>{formatDate(item.performed_at)}</td><td>{formatDate(item.next_due)}</td><td>{item.description}</td>
        <td><Badge tone={item.status === 'overdue' ? 'warning' : 'good'}>{item.status === 'overdue' ? 'Atrasada' : 'Em dia'}</Badge></td>
      </tr>)}</tbody>
    </table></div></section>
  );
}
function Metrics({ data }) {
  if (!data) return <section className="panel"><Empty message="As métricas ainda não foram carregadas." /></section>;
  return <>
    <div className="stats">
      <Stat label="Filamento usado" value={number(data.material_used_kg)} note="kg em agendamentos concluídos" icon={Package} />
      <Stat label="Agendamentos concluídos" value={data.bookings_done} note="Execuções finalizadas" icon={CalendarDays} />
      <Stat label="Agendamentos cancelados" value={data.bookings_cancelled} note="Sem consumo efetivo" icon={AlertCircle} />
      <Stat label="Manutenções" value={data.maintenance_count} note="Registros preventivos" icon={Wrench} />
    </div>
    <div className="dashboard-grid metrics-grid">
      <MetricTable title="Uso de filamento por agendamento" headers={['Projeto', 'Material', 'Gramas']} rows={data.material_by_booking.map((item) => [item.project_name, item.material_name, number(item.material_grams)])} empty="Nenhum consumo FDM concluído." />
      <MetricTable title="Agendamentos cancelados" headers={['Projeto', 'Motivo', 'Data']} rows={data.cancelled_bookings.map((item) => [item.project_name, item.cancel_reason, formatDateTime(item.cancelled_at)])} empty="Nenhum agendamento cancelado." />
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Manutenções por equipamento</h2><p>Horas acumuladas em execuções concluídas.</p></div><Wrench size={20} className="muted" /></div><div className="table-scroll"><table><thead><tr><th>Equipamento</th><th>Última</th><th>Próxima</th><th>Horas</th><th>Status</th></tr></thead><tbody>{data.maintenance_by_equipment.map((item) => <tr key={item.id}><td><strong>{item.equipment_code}</strong><small>{item.equipment_model}</small></td><td>{item.performed_at ? formatDate(item.performed_at) : '—'}</td><td>{item.next_due ? formatDate(item.next_due) : '—'}</td><td>{item.hours} h</td><td><Badge tone={item.status === 'overdue' ? 'warning' : 'good'}>{item.status === 'overdue' ? 'Atrasada' : 'Em dia'}</Badge></td></tr>)}</tbody></table></div></section>
  </>;
}
function MetricTable({ title, headers, rows, empty }) {
  return <section className="panel table-panel"><div className="panel-heading"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty message={empty} />}</div></section>;
}
function BookingBadge({ status }) {
  const labels = { scheduled: 'Agendado', confirmed: 'Confirmado', in_progress: 'Em andamento', done: 'Concluído', cancelled: 'Cancelado', interrupted: 'Interrompido' };
  const tones = { cancelled: 'warning', interrupted: 'warning', done: 'good' };
  return <Badge tone={tones[status] || 'neutral'}>{labels[status] || status}</Badge>;
}
function formatDate(value) {
  return value ? new Date(value + (value.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}
function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
}
function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—';
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
