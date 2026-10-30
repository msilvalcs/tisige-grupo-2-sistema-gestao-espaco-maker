export async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-SIGES-Request': '1', ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ message: 'Não foi possível ler a resposta do servidor. Tente novamente.' }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(
      data.fields?.map((f) => f.field + ': ' + f.message).join(' ') ||
        data.message ||
        'Falha na solicitação.',
    );
  }
  return data;
}
