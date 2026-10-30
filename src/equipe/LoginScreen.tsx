import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../ui';
import { autenticar, type Equipe } from './sessao';

export function LoginScreen({ onEntrar }: { onEntrar: (equipe: Equipe) => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  function entrar(e: FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !senha) { setErro('Informe usuário e senha.'); return; }
    const equipe = autenticar(usuario, senha);
    if (equipe) onEntrar(equipe);
    else setErro('Usuário ou senha incorretos. Confira e tente de novo.');
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] bg-bg">
      {/* Painel da marca: preto nos dois temas, como a placa do logo. */}
      <section className="relative overflow-hidden flex flex-col gap-8 bg-[#0b0b0d] text-white px-6 py-7 md:px-14 md:py-12 md:border-r md:border-white/10">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg?v=2" alt="" className="w-10 h-10 rounded-sm ring-1 ring-white/15" />
          <div>
            <div className="font-semibold text-[1.05rem] leading-tight">2D Consultores</div>
            <div className="text-[0.82rem] text-white/65 leading-tight mt-0.5">Carteira de Monitoria</div>
          </div>
        </div>

        <div className="relative z-10 max-w-[30rem] md:mt-[9vh]">
          <h1 className="text-[1.6rem] md:text-[3rem] font-semibold leading-[1.1] tracking-[-0.025em] text-balance">
            Quem precisa de você hoje?
          </h1>
          <p className="mt-3 md:mt-5 text-[0.95rem] md:text-[1.1rem] text-white/70">A carteira inteira, no ritmo.</p>
        </div>

        {/* A seta ascendente do logo, em escala de painel. */}
        <svg
          viewBox="0 0 640 210"
          aria-hidden
          className="hidden md:block absolute left-0 bottom-0 w-full text-[#dabb6c]"
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M-30 225 L220 95 L340 165 L605 22" />
          <path d="M515 14 L608 20 L603 112" />
        </svg>
      </section>

      <main className="flex items-center justify-center px-6 py-10 md:px-12">
        <form onSubmit={entrar} className="w-full max-w-[360px]" noValidate>
          <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-text-primary">Entrar</h2>
          <p className="mt-1 mb-7 text-[0.92rem] text-text-secondary">Use o login da sua equipe.</p>

          <Field label="Usuário">
            <Input className="h-11" value={usuario} onChange={(e) => { setUsuario(e.target.value); setErro(''); }} autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="Senha">
            <Input className="h-11" type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoComplete="current-password" />
          </Field>

          {erro && <p role="alert" className="text-[0.85rem] text-danger mb-4">{erro}</p>}

          <Button type="submit" variant="primary" className="w-full !h-11 !text-[0.95rem] !font-semibold">
            Entrar
          </Button>
        </form>
      </main>
    </div>
  );
}
