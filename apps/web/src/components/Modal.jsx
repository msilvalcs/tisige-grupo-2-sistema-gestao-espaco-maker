import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.mjs';
import { number } from '../lib/format.mjs';
import { Field, Empty } from './ui.jsx';
export function Modal({ modal, user, users, projects = [], equipment = [], materials = [], onClose, onSaved }) {
  const { kind, item = {} } = modal;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tech, setTech] = useState(item.technology || 'FDM'),
    [history, setHistory] = useState(null),
    [selectedEquipment, setSelectedEquipment] = useState(item.equipment_id || equipment.find((entry) => entry.active)?.id || ''),
    [pendingBooking, setPendingBooking] = useState(null);
  const requestKey = React.useState(() => globalThis.crypto?.randomUUID?.() || String(Date.now()))[0];
  const selectedEquipmentRecord = equipment.find((entry) => entry.id === selectedEquipment);
  const compatibleMaterials = materials.filter(
    (entry) => entry.active && entry.technology === selectedEquipmentRecord?.technology,
  );
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
  }[kind];
  const heading =
    kind === 'history'
      ? 'Histórico de estoque'
      : kind === 'movement'
        ? 'Movimentar estoque'
        : kind === 'cancel-booking'
          ? 'Cancelar agendamento'
          : kind === 'booking'
            ? 'Novo agendamento'
            : kind === 'maintenance'
              ? 'Registrar manutenção'
              : (item.id ? 'Editar ' : 'Cadastrar ') + name;
  async function saveBooking(values, confirmLowStock = false) {
    const startedAt = new Date(`${values.start_date}T${values.start_time}`);
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
      confirm_low_stock: confirmLowStock,
    };
    const result = await api('/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': requestKey },
      body: JSON.stringify(payload),
    });
    if (result.requires_confirmation && !confirmLowStock) {
      setPendingBooking(payload);
      return;
    }
    await onSaved('Agendamento criado com sucesso.');
  }
  async function confirmBooking() {
    setBusy(true);
    setError('');
    try {
      await saveBooking(pendingBooking, true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (kind === 'booking') {
      try {
        await saveBooking(values);
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
    const path =
      kind === 'movement'
        ? '/materials/' + item.id + '/movements'
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
        {kind === 'history' ? (
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
              <div className="history-list">
                {history.map((m) => (
                  <article key={m.id}>
                    <div>
                      <strong>
                        {Number(m.quantity) > 0 ? '+' : ''}
                        {number(m.quantity)} {item.unit}
                      </strong>
                      <span>
                        Saldo: {number(m.resulting_balance)} {item.unit}
                      </span>
                    </div>
                    <p>{m.reason}</p>
                    <small>
                      {m.author_name} ·{' '}
                      {new Date(m.created_at).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              !error && <Empty message="Ainda não há movimentações para este insumo." />
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            {kind === 'booking' && (
              <>
                <p className="helper">Escolha um equipamento compatível e informe o intervalo da reserva.</p>
                <div className="equipment-grid">
                  {equipment.map((entry) => (
                    <label className={'equipment-card' + (selectedEquipment === entry.id ? ' selected' : '')} key={entry.id}>
                      <input
                        type="radio"
                        name="equipment_id"
                        value={entry.id}
                        checked={selectedEquipment === entry.id}
                        disabled={!entry.active}
                        onChange={(event) => setSelectedEquipment(event.target.value)}
                        required
                      />
                      <strong>{entry.code}</strong>
                      <small>{entry.model} · {entry.technology === 'RESIN' ? 'Resina' : 'FDM'}</small>
                      {!entry.active && <em>Indisponível</em>}
                    </label>
                  ))}
                </div>
                <Field label="Projeto">
                  <select name="project_id" required defaultValue={projects.find((project) => project.active)?.id || ''}>
                    <option value="" disabled>Selecione o projeto</option>
                    {projects.filter((project) => project.active).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>
                <Field label="Material">
                  <select key={selectedEquipment} name="material_id" required defaultValue={compatibleMaterials[0]?.id || ''}>
                    <option value="" disabled>Selecione o material</option>
                    {compatibleMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.unit} · disponível {number(material.available)}</option>)}
                  </select>
                </Field>
                <div className="form-grid two-columns">
                  <Field label="Data de início"><input type="date" name="start_date" min={new Date().toISOString().slice(0, 10)} required /></Field>
                  <Field label="Hora de início"><input type="time" name="start_time" required /></Field>
                </div>
                <div className="form-grid two-columns">
                  <Field label="Duração (minutos)"><input type="number" name="duration_min" min="1" max="1440" defaultValue="60" required /></Field>
                  <Field label="Quantidade estimada (g/ml)"><input type="number" name="material_grams" min="1" max="99999" step="0.001" required /></Field>
                </div>
                <Field label="Observações"><textarea name="notes" maxLength={2000} rows={3} /></Field>
                {pendingBooking && (
                  <div className="confirmation" role="alertdialog" aria-label="Confirmar saldo insuficiente">
                    <strong>Saldo insuficiente para esta reserva.</strong>
                    <p>Ao confirmar, o sistema registrará a reserva mesmo acima do saldo físico atual.</p>
                    <div className="modal-actions">
                      <button type="button" className="secondary" onClick={() => setPendingBooking(null)} disabled={busy}>Revisar dados</button>
                      <button type="button" className="primary" onClick={confirmBooking} disabled={busy}>{busy ? 'Confirmando...' : 'Confirmar mesmo assim'}</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {kind === 'maintenance' && (
              <>
                <Field label="Equipamento"><select name="equipment_id" required defaultValue={equipment.find((entry) => entry.active)?.id || ''}><option value="" disabled>Selecione o equipamento</option>{equipment.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.model}</option>)}</select></Field>
                <Field label="Data de realização"><input type="date" name="performed_at" max={new Date().toISOString().slice(0, 10)} required /></Field>
                <Field label="Descrição"><textarea name="description" minLength={5} maxLength={1000} rows={4} required /></Field>
                <Field label="Próxima data prevista"><input type="date" name="next_due" min={new Date().toISOString().slice(0, 10)} required /></Field>
              </>
            )}
            {kind === 'cancel-booking' && (
              <>
                <p className="muted">{item.equipment_code} · {formatBookingStart(item.started_at)} · {item.project_name}</p>
                <Field label="Motivo do cancelamento"><textarea name="reason" minLength={5} maxLength={255} rows={4} required /></Field>
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
                    ? 'Criar agendamento'
                    : kind === 'maintenance'
                      ? 'Registrar manutenção'
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
