import React from 'react';
import { History, Pencil, Plus } from 'lucide-react';
import { number, technology } from '../lib/format.mjs';
import { Badge, Empty } from './ui.jsx';
export function Records({ page, records, manager, onEdit, onMove, onHistory }) {
  if (!records.length) return <Empty />;
  const headings = {
    projects: ['Projeto', 'Responsável', 'Descrição', 'Situação', ''],
    equipment: ['Equipamento', 'Tecnologia / local', 'Condição agora', 'Modelo', ''],
    materials: ['Material / unidade', 'Físico', 'Reservado', 'Disponível', 'Mínimo / status', ''],
    users: ['Pessoa', 'E-mail', 'Perfil'],
  }[page];
  if (!headings) return <Empty message="Esta página não está disponível." />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={row.id}>
              {page === 'projects' ? (
                <>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.description || 'Sem descrição'}</small>
                  </td>
                  <td>{row.owner_name}</td>
                  <td>{row.description || '—'}</td>
                  <td>
                    <Badge tone={row.active ? 'good' : 'neutral'}>
                      {row.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="secondary table-action"
                      aria-label={'Editar ' + row.name}
                      onClick={() => onEdit(row)}
                    >
                      Editar
                    </button>
                  </td>
                </>
              ) : page === 'equipment' ? (
                <>
                  <td>{row.code}</td>
                  <td>
                    {technology(row.technology)} · {row.location}
                  </td>
                  <td>
                    <Badge
                      tone={
                        !row.active
                          ? 'neutral'
                          : row.condition_now === 'maintenance'
                            ? 'warning'
                            : row.condition_now === 'printing'
                              ? 'neutral'
                              : 'good'
                      }
                    >
                      {!row.active
                        ? 'Inativo'
                        : row.condition_now === 'maintenance'
                          ? 'Manutenção'
                          : row.condition_now === 'printing'
                            ? 'Imprimindo'
                            : 'Livre'}
                    </Badge>
                  </td>
                  <td>{row.model}</td>
                  <td>
                    {manager && (
                      <button
                        className="secondary table-action"
                        aria-label={'Editar ' + row.code}
                        onClick={() => onEdit(row)}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </>
              ) : page === 'materials' ? (
                <>
                  <td>
                    {row.name} · {row.unit}
                  </td>
                  <td>{number(row.physical)}</td>
                  <td>{number(row.reserved)}</td>
                  <td>{number(row.available)}</td>
                  <td>
                    <Badge
                      tone={
                        !row.active
                          ? 'neutral'
                          : Number(row.available) === 0
                            ? 'danger'
                            : Number(row.available) <= Number(row.minimum)
                              ? 'warning'
                              : 'good'
                      }
                    >
                      Mín. {number(row.minimum)} ·{' '}
                      {!row.active
                        ? 'Inativo'
                        : Number(row.available) === 0
                          ? 'Zerado'
                          : Number(row.available) <= Number(row.minimum)
                            ? 'Baixo'
                            : 'Normal'}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="secondary table-action"
                        aria-label={'Histórico de ' + row.name}
                        onClick={() => onHistory(row)}
                      >
                        Movimentações
                      </button>
                      {manager && (
                        <>
                          <button
                            className="icon-button"
                            aria-label={'Editar ' + row.name}
                            onClick={() => onEdit(row)}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            className="icon-button"
                            disabled={!row.active}
                            aria-label={'Movimentar ' + row.name}
                            onClick={() => onMove(row)}
                          >
                            <Plus size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.email}</td>
                  <td>
                    <Badge tone={row.role === 'manager' ? 'good' : 'neutral'}>
                      {row.role === 'manager' ? 'Gestor' : 'Usuário'}
                    </Badge>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
