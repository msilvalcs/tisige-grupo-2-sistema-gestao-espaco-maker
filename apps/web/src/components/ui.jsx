import React from 'react';
import { Box } from 'lucide-react';
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Badge({ children, tone = 'good' }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
export function Empty({ message }) {
  return (
    <div className="empty">
      <Box size={28} />
      <p>{message || 'Nenhum registro encontrado. Ajuste a busca ou crie um cadastro.'}</p>
    </div>
  );
}
