import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.mjs';
import { number } from '../lib/format.mjs';
import { Field, Empty } from './ui.jsx';
export function Modal({
  modal,
  user,
  users,
  projects = [],
  equipment = [],
  materials = [],
  onClose,
  onSaved,
}) {
  const { kind, item = {} } = modal;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tech, setTech] = useState(item.technology || 'FDM'),
    [history, setHistory] = useState(null),
    [selectedEquipment, setSelectedEquipment] = useState(
      item.equipment_id || equipment.find((entry) => entry.active)?.id || '',
    ),
    [selectedMaterialId, setSelectedMaterialId] = useState(''),
    [bookingQuantity, setBookingQuantity] = useState(''),
    [bookingDate, setBookingDate] = useState(''),
    [bookingStart, setBookingStart] = useState(''),
    [bookingDuration, setBookingDuration] = useState(60),
    [nextStatus, setNextStatus] = useState(
      item.status === 'scheduled'
        ? 'confirmed'
        : item.status === 'confirmed'
          ? 'in_progress'
          : 'done',
    ),
    [bookingReview, setBookingReview] = useState(null);
  const requestKey = React.useState(
    () => globalThis.crypto?.randomUUID?.() || String(Date.now()),
  )[0];
  const selectedEquipmentRecord = equipment.find((entry) => entry.id === selectedEquipment);
  const compatibleMaterials = materials.filter(
    (entry) => entry.active && entry.technology === selectedEquipmentRecord?.technology,
  );
  const materialChoice =
    compatibleMaterials.find((entry) => entry.id === selectedMaterialId) ||
    compatibleMaterials.find((entry) => Number(entry.available) > 0) ||
    compatibleMaterials[0];
  const selectedMaterial = materials.find((entry) => entry.id === bookingReview?.material_id);
  const selectedProject = projects.find((entry) => entry.id === bookingReview?.project_id);
  useEffect(() => {
    if (kind === 'history')
      api('/materials/' + item.id + '/movements')
        .then(setHistory)
        .catch((e) => setError(e.message));
  }, [kind, item.id]);
  useEffect(() => {
    const previous = document.activeElement;
    const escape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    document.querySelector('[role=dialog]')?.querySelector('input,button')?.focus();
    return () => {
      document.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);
  const name = {
    projects: 'projeto',
    equipment: 'equipamento',
    materials: 'insumo',
    users: 'pessoa',
    booking: 'agendamento',
    maintenance: 'manutenção',
    'cancel-booking': 'cancelamento',
    'status-booking': 'impressão',
  }[kind];
  const heading =
    kind === 'history'
      ? 'Histórico de estoque'
      : kind === 'movement'
        ? 'Atualizar estoque'
        : kind === 'cancel-booking'
          ? 'Cancelar reserva'
          : kind === 'status-booking'
            ? 'Acompanhar impressão'
            : kind === 'booking'
              ? bookingReview
                ? 'Revise seu agendamento'
                : 'Novo agendamento'
              : kind === 'maintenance'
                ? 'Programar manutenção'
                : kind === 'projects'
                  ? item.id
                    ? 'Editar projeto'
                    : 'Novo projeto'
                  : kind === 'equipment'
                    ? item.id
                      ? 'Editar equipamento'
                      : 'Novo equipamento'
                    : kind === 'materials'
                      ? item.id
                        ? 'Editar insumo'
                        : 'Novo insumo'
                      : (item.id ? 'Editar ' : 'Cadastrar ') + name;
  async function saveBooking(values) {
    // The confirmation step reuses the already normalized payload returned by
    // the first request, so it has started_at instead of form date/time fields.
    const startedAt = values.started_at
      ? new Date(values.started_at)
      : new Date(`${values.start_date}T${values.start_time}`);
    if (Number.isNaN(startedAt.getTime()) || startedAt <= new Date()) {
      throw new Error('Informe uma data e hora de início no futuro.');
    }
    const payload = {
      equipment_id: values.equipment_id,
      material_id: values.material_id,
      project_id: values.project_id,
      started_at: startedAt.toISOString(),
      duration_min: Number(values.duration_min),
      material_grams: Number(values.material_grams),
      notes: values.notes || '',
    };
    await api('/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': requestKey },
      body: JSON.stringify(payload),
    });
    await onSaved('Agendamento criado com sucesso.');
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (kind === 'booking') {
      setBookingReview(values);
      return;
    }
    setBusy(true);
    if (kind === 'status-booking') {
      try {
        await api('/bookings/' + item.id + '/status', {
          method: 'PATCH',
          body: JSON.stringify({
            status: values.status,
            actual_material_grams: values.actual_material_grams
              ? Number(values.actual_material_grams)
              : undefined,
            reason: values.reason || undefined,
          }),
        });
        await onSaved(
          values.status === 'done'
            ? 'Impressão concluída.'
            : values.status === 'interrupted'
              ? 'Interrupção registrada.'
              : 'Situação atualizada.',
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (kind === 'cancel-booking') {
      try {
        await api('/bookings/' + item.id + '/cancel', {
          method: 'PATCH',
          body: JSON.stringify({ reason: values.reason }),
        });
        await onSaved('Agendamento cancelado com sucesso.');
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (['projects', 'equipment', 'materials'].includes(kind))
      values.active = values.active === 'on';
    if (kind === 'materials') values.minimum = Number(values.minimum);
    if (kind === 'movement') values.quantity = Number(values.quantity);
    if (kind === 'maintenance') {
      values.starts_at = new Date(`${values.date}T${values.start_time}`).toISOString();
      values.ends_at = new Date(`${values.date}T${values.end_time}`).toISOString();
      delete values.date;
      delete values.start_time;
      delete values.end_time;
    }
    const path =
      kind === 'movement'
        ? '/materials/' + item.id + '/movements'
        : kind === 'maintenance'
          ? '/maintenance/windows'
          : '/' + kind + (item.id ? '/' + item.id : '');
    try {
      await api(path, {
        method: item.id && kind !== 'movement' ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      });
      await onSaved(
        kind === 'movement'
          ? 'Movimentação registrada com sucesso.'
          : 'Cadastro salvo com sucesso.',
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function trap(event) {
    if (event.key !== 'Tab') return;
    const elements = [
      ...event.currentTarget.querySelectorAll(
        'button:not(:disabled),input,select,textarea,a[href]',
      ),
    ];
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={trap}
      >
        <div className="modal-heading">
          <h2 id="dialog-title">{heading}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose} disabled={busy}>
            <X size={21} />
          </button>
        </div>
        {kind === 'booking' && bookingReview ? (
          <div className="review-content">
            <h3>Resumo da solicitação</h3>
            <div className="review-grid">
              <div>
                <h2>{selectedProject?.name}</h2>
                <p>Solicitante: {user.name}</p>
                <p>
                  Equipamento: {selectedEquipmentRecord?.code} ·{' '}
                  {selectedEquipmentRecord?.technology === 'RESIN' ? 'Resina' : 'FDM'}
                </p>
                <p>
                  {new Date(
                    `${bookingReview.start_date}T${bookingReview.start_time}`,
                  ).toLocaleString('pt-BR')}{' '}
                  · {bookingReview.duration_min} min
                </p>
              </div>
              <div>
                <h2>
                  {selectedMaterial?.name} · {number(bookingReview.material_grams)}{' '}
                  {selectedMaterial?.unit}
                </h2>
                <p>
                  Disponível antes: {number(selectedMaterial?.available)} {selectedMaterial?.unit}
                </p>
                <p className="accent">
                  Disponível após:{' '}
                  {number(
                    Number(selectedMaterial?.available) - Number(bookingReview.material_grams),
                  )}{' '}
                  {selectedMaterial?.unit}
                </p>
                <p>Unidade: Coração Eucarístico</p>
              </div>
            </div>
            <div className="notice blue-notice">
              <strong>Confirmação integrada</strong>
              <span>O horário e o saldo serão verificados novamente ao confirmar.</span>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setBookingReview(null)}>
                Editar dados
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await saveBooking(bookingReview);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Confirmando...' : 'Confirmar agendamento'}
              </button>
            </div>
          </div>
        ) : kind === 'history' ? (
          <>
            <p className="muted">
              {item.name} · Quantidades em {item.unit}
            </p>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {history === null && !error ? (
              <p role="status">Carregando histórico...</p>
            ) : history?.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data / hora</th>
                      <th>Tipo</th>
                      <th>Quantidade</th>
                      <th>Físico após</th>
                      <th>Responsável / vínculo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {new Date(m.created_at).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </td>
                        <td>
                          {m.reason.toLowerCase().includes('reserva')
                            ? 'Reserva'
                            : Number(m.quantity) > 0
                              ? 'Entrada'
                              : 'Saída'}
                        </td>
                        <td>
                          {Number(m.quantity) > 0 ? '+' : ''}
                          {number(m.quantity)} {item.unit}
                        </td>
                        <td>
                          {number(m.resulting_balance)} {item.unit}
                        </td>
                        <td>
                          {m.author_name} · {m.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="notice blue-notice">
                  <strong>Reserva não altera saldo físico</strong>
                  <span>
                    O material reservado permanece fisicamente no estoque até o início da impressão.
                  </span>
                </div>
              </div>
            ) : (
              !error && <Empty message="Ainda não há movimentações para este insumo." />
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            {kind === 'booking' && (
              <div className="booking-form-layout">
                <div className="booking-main">
                  <p className="helper">
                    Vincule a impressão a um projeto e confira horário e saldo antes de reservar.
                  </p>
                  <h3>1. Solicitante e projeto</h3>
                  <Field label="Solicitante">
                    <input value={`${user.name} · Usuário identificado`} readOnly />
                  </Field>
                  <Field label="Projeto">
                    <select
                      name="project_id"
                      required
                      defaultValue={projects.find((project) => project.active)?.id || ''}
                    >
                      <option value="" disabled>
                        Selecione o projeto
                      </option>
                      {projects
                        .filter((project) => project.active)
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <h3>2. Equipamento e material</h3>
                  <div className="tech-tabs">
                    <button
                      type="button"
                      className={
                        selectedEquipmentRecord?.technology === 'FDM' ? 'primary' : 'secondary'
                      }
                      onClick={() => {
                        setSelectedEquipment(
                          equipment.find((entry) => entry.active && entry.technology === 'FDM')
                            ?.id || '',
                        );
                        setSelectedMaterialId('');
                      }}
                    >
                      Impressoras FDM
                    </button>
                    <button
                      type="button"
                      className={
                        selectedEquipmentRecord?.technology === 'RESIN' ? 'primary' : 'secondary'
                      }
                      onClick={() => {
                        setSelectedEquipment(
                          equipment.find((entry) => entry.active && entry.technology === 'RESIN')
                            ?.id || '',
                        );
                        setSelectedMaterialId('');
                      }}
                    >
                      Impressoras de resina
                    </button>
                  </div>
                  <Field label="Equipamento">
                    <select
                      name="equipment_id"
                      value={selectedEquipment}
                      onChange={(event) => {
                        setSelectedEquipment(event.target.value);
                        setSelectedMaterialId('');
                      }}
                      required
                    >
                      <option value="" disabled>
                        Selecione o equipamento
                      </option>
                      {equipment
                        .filter(
                          (entry) =>
                            entry.active &&
                            entry.technology === selectedEquipmentRecord?.technology,
                        )
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.code} · {entry.location}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Material">
                    <select
                      name="material_id"
                      required
                      value={materialChoice?.id || ''}
                      onChange={(event) => setSelectedMaterialId(event.target.value)}
                    >
                      <option value="" disabled>
                        Selecione o material
                      </option>
                      {compatibleMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name} · {material.unit} · disponível{' '}
                          {number(material.available)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <h3>3. Data, horário e consumo</h3>
                  <div className="form-grid two-columns">
                    <Field label="Data de início">
                      <input
                        type="date"
                        name="start_date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={bookingDate}
                        onChange={(event) => setBookingDate(event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Hora de início">
                      <input
                        type="time"
                        name="start_time"
                        value={bookingStart}
                        onChange={(event) => setBookingStart(event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <div className="form-grid two-columns">
                    <Field label="Duração (minutos)">
                      <input
                        type="number"
                        name="duration_min"
                        min="1"
                        max="1440"
                        value={bookingDuration}
                        onChange={(event) => setBookingDuration(event.target.value)}
                        required
                      />
                    </Field>
                    <Field label={`Quantidade estimada (${materialChoice?.unit || 'g/ml'})`}>
                      <input
                        type="number"
                        name="material_grams"
                        min="1"
                        max="99999"
                        step="0.001"
                        value={bookingQuantity}
                        onChange={(event) => setBookingQuantity(event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Observações">
                    <textarea name="notes" maxLength={2000} rows={3} />
                  </Field>
                </div>
                <aside className="booking-summary">
                  <h3>Resumo da reserva</h3>
                  <span className="badge neutral">
                    {selectedEquipmentRecord?.technology === 'RESIN'
                      ? 'Resina · unidade ml'
                      : 'FDM · unidade g'}
                  </span>
                  <h3>
                    {bookingDate && bookingStart
                      ? `${new Date(`${bookingDate}T${bookingStart}`).toLocaleDateString('pt-BR')} · ${bookingStart}`
                      : 'Escolha data e horário'}
                  </h3>
                  <strong>{selectedEquipmentRecord?.code || 'Selecione o equipamento'}</strong>
                  <p>{materialChoice?.name || 'Selecione um material'}</p>
                  <p>
                    Físico: {number(materialChoice?.physical || 0)} {materialChoice?.unit}
                  </p>
                  <p>
                    Já reservado: {number(materialChoice?.reserved || 0)} {materialChoice?.unit}
                  </p>
                  <strong>
                    Disponível agora: {number(materialChoice?.available || 0)}{' '}
                    {materialChoice?.unit}
                  </strong>
                  {bookingQuantity && (
                    <strong
                      className={
                        Number(bookingQuantity) > Number(materialChoice?.available)
                          ? 'stock-deficit'
                          : 'accent'
                      }
                    >
                      Após esta reserva:{' '}
                      {number(Number(materialChoice?.available) - Number(bookingQuantity))}{' '}
                      {materialChoice?.unit}
                    </strong>
                  )}
                  <div className="notice blue-notice">
                    <strong>Material reservado na confirmação</strong>
                    <span>
                      A baixa ocorre ao iniciar a impressão. Cancelar antes do uso libera o saldo.
                    </span>
                  </div>
                  <p>O horário e o saldo serão verificados novamente ao confirmar.</p>
                </aside>
              </div>
            )}
            {kind === 'status-booking' && (
              <>
                <h3>
                  {item.equipment_code} · {formatBookingStart(item.started_at)}
                </h3>
                <p>
                  {item.project_name} · {item.user_name} · {item.material_name} ·{' '}
                  {number(item.material_grams)} {item.material_unit} estimados
                </p>
                <Field label="Próxima situação">
                  <select
                    name="status"
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                    required
                  >
                    {(item.status === 'scheduled'
                      ? [['confirmed', 'Confirmar reserva']]
                      : item.status === 'confirmed'
                        ? [['in_progress', 'Iniciar impressão']]
                        : item.status === 'in_progress'
                          ? [
                              ['done', 'Concluída'],
                              ['interrupted', 'Interrompida'],
                            ]
                          : []
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {item.status === 'in_progress' && (
                  <>
                    <Field label={`Consumo real (${item.material_unit})`}>
                      <input
                        type="number"
                        name="actual_material_grams"
                        min="0"
                        step="0.001"
                        defaultValue={item.material_grams}
                        required
                      />
                    </Field>
                    <Field label="Motivo / observação">
                      <textarea
                        name="reason"
                        rows={3}
                        minLength={5}
                        maxLength={255}
                        required={nextStatus === 'interrupted'}
                        placeholder="Obrigatório se a impressão for interrompida"
                      />
                    </Field>
                    <div className="notice blue-notice">
                      <strong>Ajuste do consumo</strong>
                      <span>
                        O saldo físico será atualizado pelo consumo real informado no encerramento.
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
            {kind === 'maintenance' && (
              <>
                <h3>Programação do serviço</h3>
                <div className="form-grid two-columns">
                  <Field label="Equipamento">
                    <select
                      name="equipment_id"
                      required
                      defaultValue={equipment.find((entry) => entry.active)?.id || ''}
                    >
                      <option value="" disabled>
                        Selecione o equipamento
                      </option>
                      {equipment
                        .filter((entry) => entry.active)
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.code} · {entry.model}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Tipo">
                    <select name="kind">
                      <option value="preventive">Preventiva</option>
                      <option value="corrective">Corretiva</option>
                    </select>
                  </Field>
                </div>
                <div className="form-grid three-columns">
                  <Field label="Data">
                    <input
                      type="date"
                      name="date"
                      min={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </Field>
                  <Field label="Início">
                    <input type="time" name="start_time" required />
                  </Field>
                  <Field label="Fim">
                    <input type="time" name="end_time" required />
                  </Field>
                </div>
                <Field label="Responsável">
                  <input
                    name="responsible"
                    defaultValue={user.name}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="Serviço / motivo">
                  <textarea name="description" minLength={5} maxLength={1000} rows={3} required />
                </Field>
                <div className="notice blue-notice">
                  <strong>Verificação de conflito</strong>
                  <span>
                    Reservas existentes e outros serviços serão verificados na confirmação.
                  </span>
                </div>
              </>
            )}
            {kind === 'cancel-booking' && (
              <>
                <p className="muted">
                  {item.equipment_code} · {formatBookingStart(item.started_at)} ·{' '}
                  {item.project_name}
                </p>
                <Field label="Motivo do cancelamento">
                  <textarea name="reason" minLength={5} maxLength={255} rows={4} required />
                </Field>
              </>
            )}
            {kind === 'projects' && (
              <>
                <Field
                  label="Nome do projeto"
                  name="name"
                  defaultValue={item.name}
                  required
                  minLength={2}
                  maxLength={100}
                />
                <Field label="Descrição">
                  <textarea
                    name="description"
                    defaultValue={item.description}
                    maxLength={1000}
                    rows={3}
                  />
                </Field>
                <Field label="Responsável">
                  <select name="owner_id" defaultValue={item.owner_id || user.id}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {kind === 'equipment' && (
              <>
                <Field
                  label="Identificador único"
                  name="code"
                  defaultValue={item.code}
                  required
                  minLength={2}
                  maxLength={30}
                />
                <Field
                  label="Modelo"
                  name="model"
                  defaultValue={item.model}
                  required
                  minLength={2}
                  maxLength={100}
                />
                <Field label="Tecnologia">
                  <select name="technology" defaultValue={item.technology || 'FDM'}>
                    <option value="FDM">FDM · Filamento</option>
                    <option value="RESIN">Resina</option>
                  </select>
                </Field>
                <Field
                  label="Localização"
                  name="location"
                  defaultValue={item.location || 'Coração Eucarístico'}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </>
            )}
            {kind === 'materials' && (
              <>
                <Field
                  label="Nome do insumo"
                  name="name"
                  defaultValue={item.name}
                  required
                  minLength={2}
                  maxLength={100}
                />
                <Field label="Tecnologia e unidade">
                  <select name="technology" value={tech} onChange={(e) => setTech(e.target.value)}>
                    <option value="FDM">Filamento · gramas (g)</option>
                    <option value="RESIN">Resina · mililitros (ml)</option>
                  </select>
                </Field>
                <Field
                  label={'Estoque mínimo (' + (tech === 'FDM' ? 'g' : 'ml') + ')'}
                  name="minimum"
                  type="number"
                  min="0"
                  max="999999999"
                  step="0.001"
                  defaultValue={item.minimum || 0}
                  required
                />
                <p className="helper">
                  O saldo é alterado apenas por movimentações com autoria e motivo.
                </p>
              </>
            )}
            {kind === 'users' && (
              <>
                <Field label="Nome" name="name" required minLength={2} maxLength={100} />
                <Field label="E-mail" name="email" type="email" required maxLength={254} />
                <Field
                  label="Senha inicial"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
                <Field label="Perfil">
                  <select name="role">
                    <option value="user">Usuário</option>
                    <option value="manager">Gestor</option>
                  </select>
                </Field>
                <p className="helper">A senha deve ter no mínimo 12 caracteres.</p>
              </>
            )}
            {kind === 'movement' && (
              <>
                <p className="muted">
                  {item.name} · Disponível: {number(item.available)} {item.unit}
                </p>
                <Field
                  label={'Quantidade (' + item.unit + ')'}
                  name="quantity"
                  type="number"
                  step="0.001"
                  min="-999999999"
                  max="999999999"
                  required
                />
                <p className="helper">
                  Use valor positivo para entrada e negativo para saída ou correção.
                </p>
                <Field label="Motivo">
                  <textarea name="reason" minLength={5} maxLength={500} required rows={3} />
                </Field>
              </>
            )}
            {['projects', 'equipment', 'materials'].includes(kind) && (
              <label className="checkbox">
                <input type="checkbox" name="active" defaultChecked={item.active ?? true} />
                Cadastro ativo
              </label>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Salvando...'
                  : kind === 'booking'
                    ? 'Revisar agendamento'
                    : kind === 'status-booking'
                      ? 'Registrar situação'
                      : kind === 'maintenance'
                        ? 'Confirmar programação'
                        : kind === 'cancel-booking'
                          ? 'Confirmar cancelamento'
                          : kind === 'movement'
                            ? 'Registrar movimentação'
                            : 'Salvar cadastro'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function formatBookingStart(value) {
  return value
    ? new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';
}
