export const number = (value) =>
  Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const technology = (value) => (value === 'RESIN' ? 'Resina' : 'FDM');
