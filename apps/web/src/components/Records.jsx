import React from 'react';
import { History, Pencil, Plus } from 'lucide-react';
import { number, technology } from '../lib/format.mjs';
import { Badge, Empty } from './ui.jsx';
export function Records({ page, records, manager, onEdit, onMove, onHistory }) {
  if (!records.length) return <Empty />;
  const headings = {
    projects: ['Projeto', 'Responsável', 'Situação', 'Ações'],
    equipment: ['Identificação / modelo', 'Tecnologia', 'Localização', 'Situação', 'Ações'],
    materials: ['Insumo', 'Tecnologia', 'Físico', 'Reservado', 'Disponível', 'Situação', 'Ações'],
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
                  <td>
                    <Badge tone={row.active ? 'good' : 'neutral'}>
                      {row.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={'Editar ' + row.name}
                      onClick={() => onEdit(row)}
                    >
                      <Pencil size={17} />
                    </button>
                  </td>
                </>
              ) : page === 'equipment' ? (
                <>
                  <td>
                    <strong>{row.code}</strong>
                    <small>{row.model}</small>
                  </td>
                  <td>
                    <Badge tone="neutral">{technology(row.technology)}</Badge>
                  </td>
                  <td>{row.location}</td>
                  <td>
                    <Badge tone={row.active ? 'good' : 'neutral'}>
                      {row.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>
                    {manager && (
                      <button
                        className="icon-button"
                        aria-label={'Editar ' + row.code}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil size={17} />
                      </button>
                    )}
                  </td>
                </>
              ) : page === 'materials' ? (
                <>
                  <td>
                    <strong>{row.name}</strong>
                    <small>
                      Mínimo: {number(row.minimum)} {row.unit}
                    </small>
                  </td>
                  <td>{technology(row.technology)}</td>
                  <td>
                    {number(row.physical)} {row.unit}
                  </td>
                  <td>
                    {number(row.reserved)} {row.unit}
                  </td>
                  <td>
                    <strong>
                      {number(row.available)} {row.unit}
                    </strong>
                  </td>
                  <td>
                    <Badge
                      tone={
                        !row.active
                          ? 'neutral'
                          : Number(row.available) <= Number(row.minimum)
                            ? 'warning'
                            : 'good'
                      }
                    >
                      {!row.active
                        ? 'Inativo'
                        : Number(row.available) === 0
                          ? 'Sem estoque'
                          : Number(row.available) <= Number(row.minimum)
                            ? 'Estoque baixo'
                            : 'Regular'}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={'Histórico de ' + row.name}
                        onClick={() => onHistory(row)}
                      >
                        <History size={17} />
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
