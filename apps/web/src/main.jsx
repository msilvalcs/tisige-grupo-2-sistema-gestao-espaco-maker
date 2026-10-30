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
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['bookings', 'Agendamentos', CalendarDays],
  ['projects', 'Projetos', FolderKanban],
  ['equipment', 'Equipamentos', Printer],
  ['materials', 'Insumos', Package],
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
    [connectionError, setConnectionError] = useState(false),
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
    setConnectionError(false);
    try {
      const [projects, equipment, materials, users, bookings, extra] = await Promise.all([
        ...['/projects', '/equipment', '/materials', '/users'].map((path) => api(path)),
        api(manager ? '/bookings' : '/bookings/mine'),
        api(
          page === 'dashboard'
            ? '/dashboard'
            : page === 'maintenance'
                ? '/maintenance/windows'
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
        bookings,
        maintenance: page === 'maintenance' ? extra : current.maintenance,
        metrics: page === 'metrics' ? extra : current.metrics,
      }));
      setUpdated(new Date());
    } catch (e) {
      setError(e.message);
      setConnectionError(true);
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
    projects: 'Cada impressão vinculada a um projeto, responsável, equipamento e material.',
    equipment: 'Cadastro, condição operacional e disponibilidade das impressoras.',
    materials: 'Saldo físico, material reservado e quantidade disponível para novas reservas.',
    bookings: 'Reservas, disponibilidade e acompanhamento das impressões.',
    maintenance: 'Programe serviços, acompanhe vencimentos e preserve o histórico.',
    metrics: 'Consumo real e resultados do período, com origem rastreável.',
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
        <a className="brand" href="#dashboard">SIGES<span>Gestão Maker</span></a>
        <div className="nav-heading">ESPAÇO DE TRABALHO</div>
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
                <Icon size={19} className="nav-icon" />
                {label}
              </a>
            ))}
        </nav>
        <div className="sidebar-foot">
          <strong>Espaço Maker PUC Minas</strong>
          <small>Coração Eucarístico</small>
          <small>{user.name} · {manager ? 'Gestor' : 'Usuário'}</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span>SIGES / </span>
            {title}
          </div>
          <time className="topbar-time">{new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'medium', timeStyle: 'short' })}</time>
          <div className="account">
            <span className="role-pill">{manager ? 'Gestor' : 'Usuário'}</span>
            <button className="icon-button" onClick={logout} aria-label="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>{connectionError ? 'Não foi possível atualizar os dados' : page === 'dashboard' ? (data.dashboard?.saudacao || 'Olá') + ', ' + user.name.split(' ')[0] : page === 'equipment' ? 'Gestão de equipamentos' : page === 'materials' ? 'Gestão de insumos' : page === 'metrics' ? 'Métricas de impressão' : title}</h1>
              <p className="muted">
                {connectionError ? 'A conexão foi interrompida. As informações podem estar desatualizadas.' : page === 'dashboard'
                  ? 'Acompanhe a operação do espaço maker em um só lugar.'
                  : descriptions[page]}
              </p>
            </div>
            {(page === 'dashboard' || page === 'bookings' || page === 'maintenance' || page === 'projects' || page === 'equipment' || page === 'materials' || page === 'users') &&
              (page === 'dashboard' || manager || page === 'projects' || page === 'bookings') &&
              navigation.some(([k]) => k === page) && !connectionError && (
                <button className="primary" onClick={page === 'dashboard' ? newBooking : () => setModal({ kind: page })}>
                  <Plus size={18} />
                  {page === 'dashboard'
                    ? 'Novo agendamento'
                    : {
                        projects: 'Novo projeto',
                        equipment: 'Novo equipamento',
                        materials: 'Novo insumo',
                        bookings: 'Novo agendamento',
                        maintenance: 'Programar manutenção',
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
          {error && !connectionError && (
            <div className="error" role="alert">
              {error}{' '}
              <button className="text-button" onClick={load}>
                Tentar novamente
              </button>
            </div>
          )}
          {connectionError && !loading && <><div className="notice warning-notice"><strong>Última atualização confirmada: {updated ? updated.toLocaleString('pt-BR') : 'não disponível'}</strong><span>Não foi possível verificar disponibilidade e estoque. Confirmações de reservas ficam indisponíveis até a reconexão.</span></div><section className="panel offline-panel"><h2>Tente novamente</h2><p>Confira sua conexão e tente carregar o painel novamente.</p><div className="page-actions"><button className="primary" onClick={load}>Tentar atualizar</button><button className="secondary" disabled>Confirmar reserva</button></div><small>{error}</small></section></>}
          {loading ? (
            <div className="panel loading" role="status">
              Carregando dados do laboratório...
            </div>
          ) : (
            !error && (
              <>
                {page === 'dashboard' ? (
                  <Dashboard data={data} onOpenBooking={(item) => { location.hash = 'bookings'; if (['scheduled', 'confirmed', 'in_progress'].includes(item.status)) window.setTimeout(() => setModal({ kind: 'status-booking', item }), 0); }} />
                ) : page === 'bookings' ? (
                  <Bookings records={data.bookings} equipment={data.equipment} onBooking={newBooking} onCancel={(item) => setModal({ kind: 'cancel-booking', item })} onStatus={(item) => setModal({ kind: 'status-booking', item })} />
                ) : page === 'maintenance' ? (
                  <Maintenance records={data.maintenance} manager={manager} onStatus={async (item, status) => { try { await api('/maintenance/windows/' + item.id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }); await saved(status === 'done' ? 'Manutenção concluída.' : 'Manutenção iniciada.'); } catch (e) { setError(e.message); } }} />
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
                    {page === 'equipment' && <div className="stats"><Stat label="Cadastradas" value={data.equipment.length} note="Todas nesta unidade" /><Stat label="Livres agora" value={data.equipment.filter((item) => item.active && item.condition_now === 'free').length} note="Aptas para operação" /><Stat label="Imprimindo" value={data.equipment.filter((item) => item.condition_now === 'printing').length} note="Em uso neste momento" /><Stat label="Em manutenção" value={data.equipment.filter((item) => item.condition_now === 'maintenance').length} note="Indisponíveis agora" /></div>}
                    {page === 'materials' && <div className="stats"><Stat label="Insumos cadastrados" value={data.materials.length} note="Filamentos e resinas" /><Stat label="Sem alerta" value={data.materials.filter((item) => item.active && Number(item.available) > Number(item.minimum)).length} note="Disponível acima do mínimo" /><Stat label="Estoque baixo" value={data.materials.filter((item) => item.active && Number(item.available) > 0 && Number(item.available) <= Number(item.minimum)).length} note="Abaixo do mínimo" /><Stat label="Sem estoque" value={data.materials.filter((item) => item.active && Number(item.available) <= 0).length} note="Saldo indisponível" /></div>}
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
                  Atualizado às {updated?.toLocaleTimeString('pt-BR')}
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
function Dashboard({ data, onOpenBooking }) {
  const dashboard = data.dashboard || {
    bookings_today: 0,
    materials_alert: 0,
    active_equipment: 0,
    active_projects: 0,
    today_bookings: [],
    stock_alerts: [],
  };
  const active = data.equipment.filter((item) => item.active && item.condition_now !== 'maintenance').length;
  const printing = data.equipment.filter((item) => item.condition_now === 'printing').length;
  const free = data.equipment.filter((item) => item.active && item.condition_now === 'free').length;
  const maintenance = data.equipment.filter((item) => item.condition_now === 'maintenance').length;
  return <>
    <div className="stats">
      <Stat label="Aptas para operação" value={`${active} de ${data.equipment.length}`} note={`${free} livres · ${printing} imprimindo`} />
      <Stat label="Reservas hoje" value={dashboard.bookings_today} note={`${printing} em andamento · ${dashboard.today_bookings.filter((item) => item.status === 'confirmed').length} confirmadas`} />
      <Stat label="Insumos em alerta" value={dashboard.materials_alert} note={`${dashboard.stock_alerts.filter((item) => Number(item.available) > 0).length} abaixo do mínimo · ${dashboard.stock_alerts.filter((item) => Number(item.available) <= 0).length} zerados`} />
      <Stat label="Equipamentos inativos" value={maintenance} note="Indisponíveis para novas reservas" />
    </div>
    {!!dashboard.stock_alerts.length && <div className="notice warning-notice"><strong>Atenção ao estoque</strong><span>{dashboard.stock_alerts.map((item) => item.name).join(', ')} precisam de reposição.</span></div>}
    <h2 className="section-title">Agenda de hoje</h2>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Horário</th><th>Projeto / solicitante</th><th>Equipamento</th><th>Situação</th><th></th></tr></thead><tbody>{dashboard.today_bookings.map((booking) => <tr key={booking.id}><td>{formatTime(booking.started_at)} - {formatTime(new Date(new Date(booking.started_at).getTime() + booking.duration_min * 60000))}</td><td>{booking.project_name} · {booking.user_name}</td><td>{booking.equipment_code}</td><td><BookingBadge status={booking.status} /></td><td><button className="secondary table-action" onClick={() => onOpenBooking(booking)}>{booking.status === 'in_progress' ? 'Ver detalhes' : 'Ver agenda'}</button></td></tr>)}</tbody></table>{!dashboard.today_bookings.length && <Empty message="Nenhum agendamento para hoje." />}</div></section>
    <div className="dashboard-grid info-grid"><section className="panel"><h2>Materiais disponíveis</h2><p>{data.materials.filter((item) => item.active && Number(item.available) > 0).sort((a, b) => Number(b.available) - Number(a.available)).slice(0, 3).map((item) => `${item.name}: ${number(item.available)} ${item.unit}`).join(' · ') || 'Nenhum insumo disponível.'}</p><a className="secondary table-action" href="#materials">Abrir estoque</a></section><section className="panel"><h2>Disponibilidade confiável</h2><p>Última atualização: {new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p><p>Consulte a agenda para verificar o intervalo desejado.</p><a className="secondary table-action" href="#equipment">Consultar equipamentos</a></section></div>
  </>;
}
function Bookings({ records, equipment, onBooking, onCancel, onStatus }) {
  const [date, setDate] = useState('');
  const [equipmentId, setEquipmentId] = useState('all');
  const [status, setStatus] = useState('all');
  const filtered = records.filter((item) => (!date || item.started_at.slice(0, 10) === date) && (equipmentId === 'all' || item.equipment_id === equipmentId) && (status === 'all' || item.status === status));
  return (
    <><div className="booking-filters"><label>Período<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Equipamento<select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}><option value="all">Todos os equipamentos</option>{equipment.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></label><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos os status</option>{['scheduled','confirmed','in_progress','done','interrupted','cancelled'].map((value) => <option key={value} value={value}>{value === 'scheduled' ? 'Agendado' : value === 'in_progress' ? 'Em andamento' : value === 'done' ? 'Concluído' : value === 'interrupted' ? 'Interrompido' : value === 'cancelled' ? 'Cancelado' : 'Confirmado'}</option>)}</select></label></div>
    <div className="notice blue-notice"><strong>Disponibilidade por intervalo</strong><span>Máquinas em uso podem estar livres mais tarde. Confira o período ao criar uma reserva.</span></div>
    <section className="panel table-panel">
      <div className="table-scroll">
        <table>
          <thead><tr><th>Horário</th><th>Projeto / responsável</th><th>Equipamento</th><th>Material estimado</th><th>Status</th><th></th></tr></thead>
          <tbody>{filtered.map((booking) => (
            <tr key={booking.id}>
              <td>{formatDateTime(booking.started_at)} - {formatTime(new Date(new Date(booking.started_at).getTime() + booking.duration_min * 60000))}</td>
              <td>{booking.project_name} · {booking.user_name}</td>
              <td>{booking.equipment_code}</td>
              <td>{booking.material_name} · {number(booking.material_grams)} {booking.material_unit}</td>
              <td><BookingBadge status={booking.status} /></td>
              <td><div className="row-actions">{['scheduled', 'confirmed', 'in_progress'].includes(booking.status) && <button className="secondary table-action" onClick={() => onStatus(booking)}>{booking.status === 'in_progress' ? 'Acompanhar' : 'Detalhes'}</button>}{['scheduled', 'confirmed'].includes(booking.status) && <button className="text-button" onClick={() => onCancel(booking)}>Cancelar</button>}</div></td>
            </tr>
          ))}</tbody>
        </table>
        {!filtered.length && <Empty message="Nenhuma reserva encontrada para os filtros selecionados." />}
      </div>
    </section>
    <div className="page-actions"><button className="primary" onClick={onBooking}>Nova reserva</button><span>Mostrando {filtered.length} de {records.length} reservas · Horário de Brasília (UTC-3)</span></div></>
  );
}
function Maintenance({ records, manager, onStatus }) {
  const today = records.filter((item) => item.status !== 'done' && new Date(item.starts_at).toDateString() === new Date().toDateString());
  return (
    <>{!!today.length && <div className="notice warning-notice"><strong>Equipamento indisponível</strong><span>{today.map((item) => item.equipment_code).join(', ')} com manutenção prevista ou em andamento hoje.</span></div>}<section className="panel table-panel"><div className="table-scroll"><table>
      <thead><tr><th>Equipamento</th><th>Serviço / responsável</th><th>Período</th><th>Situação</th><th></th></tr></thead>
      <tbody>{records.map((item) => <tr key={item.id}>
        <td>{item.equipment_code}</td><td>{item.description} · {item.responsible}</td><td>{formatDateTime(item.starts_at)} - {formatTime(item.ends_at)}</td>
        <td><Badge tone={item.status === 'done' ? 'good' : item.status === 'in_progress' ? 'warning' : 'neutral'}>{item.status === 'done' ? 'Concluída' : item.status === 'in_progress' ? 'Em serviço' : 'Agendada'}</Badge></td><td>{manager && item.status !== 'done' && <button className="secondary table-action" onClick={() => onStatus(item, item.status === 'scheduled' ? 'in_progress' : 'done')}>{item.status === 'scheduled' ? 'Iniciar' : 'Concluir'}</button>}</td>
      </tr>)}</tbody>
    </table>{!records.length && <Empty message="Nenhuma manutenção programada." />}</div></section><section className="panel maintenance-note"><h2>Plano preventivo</h2><p>A programação verifica reservas existentes antes de bloquear o período. O histórico de cada serviço fica preservado.</p></section></>
  );
}
function Metrics({ data }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metrics, setMetrics] = useState(data);
  const [filterError, setFilterError] = useState('');
  useEffect(() => setMetrics(data), [data]);
  useEffect(() => {
    if (!from && !to) { setMetrics(data); setFilterError(''); return; }
    if (!from || !to || from > to) return;
    let active = true;
    api(`/metrics?from=${from}&to=${to}`).then((result) => { if (active) { setMetrics(result); setFilterError(''); } }).catch((error) => { if (active) setFilterError(error.message); });
    return () => { active = false; };
  }, [from, to, data]);
  if (!data) return <section className="panel"><Empty message="As métricas ainda não foram carregadas." /></section>;
  return <>
    <div className="metrics-filters"><fieldset><legend>Período analisado</legend><input type="date" aria-label="De" value={from} onChange={(event) => setFrom(event.target.value)} /><span>até</span><input type="date" aria-label="Até" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></fieldset><label>Unidade<input value="Coração Eucarístico" readOnly /></label></div>
    {filterError && <div className="error" role="alert">{filterError}</div>}
    <div className="stats">
      <Stat label="Filamento consumido" value={`${number(metrics.material_used_kg)} kg`} note="Consumo efetivo registrado" />
      <Stat label="Resina consumida" value={`${number(metrics.resin_used_ml)} ml`} note="Apurada separadamente da massa" />
      <Stat label="Impressões concluídas" value={metrics.bookings_done} note="Finalizadas no histórico" />
      <Stat label="Interrompidas" value={metrics.bookings_interrupted} note="Incluídas no consumo efetivo" />
    </div>
    <MetricTable headers={['Projeto', 'Filamento real', 'Resina real', 'Conclusões', 'Interrupções']} rows={metrics.material_by_project.map((item) => [item.project_name, `${number(item.filament_grams)} g`, `${number(item.resin_ml)} ml`, item.completions, item.interruptions])} empty="Ainda não há impressões encerradas." />
    <p className="table-caption">Totais: {number(metrics.filament_used_grams)} g de filamento · {number(metrics.resin_used_ml)} ml de resina · {metrics.bookings_done} conclusões · {metrics.bookings_interrupted} interrupções</p>
    <div className="notice blue-notice"><strong>Consumo real inclui impressões interrompidas</strong><span>Os totais representam material efetivamente utilizado. Gramas e mililitros são apresentados separadamente.</span></div>
  </>;
}
function MetricTable({ headers, rows, empty }) {
  return <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty message={empty} />}</div></section>;
}
function BookingBadge({ status }) {
  const labels = { scheduled: 'Agendado', confirmed: 'Confirmado', in_progress: 'Em andamento', done: 'Concluído', cancelled: 'Cancelado', interrupted: 'Interrompido' };
  const tones = { cancelled: 'warning', interrupted: 'warning', done: 'good' };
  return <Badge tone={tones[status] || 'neutral'}>{labels[status] || status}</Badge>;
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
        {Icon && <Icon size={19} className={warning ? 'warning-text' : 'muted'} />}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
createRoot(document.getElementById('root')).render(<App />);
