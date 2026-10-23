import React, { useState } from 'react';
import { Box, Layers3, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api.mjs';
import { Field } from './ui.jsx';
export function Login({ onLogin, initialError }) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      onLogin(await api('/auth/login', { method: 'POST', body: JSON.stringify(values) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-story">
        <a className="brand" href="/">
          <Box size={30} /> SIGES<span>ESPAÇO MAKER</span>
        </a>
        <div>
          <span className="eyebrow lime">IDEIAS GANHAM FORMA AQUI</span>
          <h1>
            Mais espaço
            <br />
            para criar.
          </h1>
          <p>
            Equipamentos, projetos e materiais.
            <br />
            Seu laboratório, conectado em um só lugar.
          </p>
          <div className="maker-art" aria-hidden="true">
            <Layers3 size={150} strokeWidth={0.7} />
            <span className="orbit one" />
            <span className="orbit two" />
            <span className="art-label">DA IDEIA AO PROTÓTIPO</span>
          </div>
        </div>
        <small>PUC Minas · Coração Eucarístico</small>
      </section>
      <main className="login-form">
        <form onSubmit={submit}>
          <span className="eyebrow">BEM-VINDO AO LABORATÓRIO</span>
          <h2>Acesse seu espaço.</h2>
          <p className="muted">Entre para acompanhar seus projetos e a operação maker.</p>
          <Field
            label="E-mail institucional"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="voce@exemplo.com"
            required
            maxLength={254}
          />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            required
            maxLength={128}
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar no SIGES'}
            <ArrowUpRight size={18} />
          </button>
          <p className="login-note">Seu acesso é fornecido pelo gestor do laboratório.</p>
        </form>
        <small className="muted">SIGES · Sistema de Gestão de Espaço Maker</small>
      </main>
    </div>
  );
}
