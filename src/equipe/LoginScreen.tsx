import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input } from '../ui';
import { autenticar, type Equipe } from './sessao';

export function LoginScreen({ onEntrar }: { onEntrar: (equipe: Equipe) => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);

  function entrar(e: FormEvent) {
    e.preventDefault();
    const equipe = autenticar(usuario, senha);
    if (equipe) onEntrar(equipe);
    else setErro(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-[360px]">
        <form onSubmit={entrar}>
          <div className="flex items-center gap-[0.65rem] mb-6">
            <img src="/favicon.svg?v=2" alt="2D Consultores" className="w-9 h-9 rounded-sm" />
            <div>
              <div className="font-semibold text-[1rem] leading-[1.1] text-text-primary">2D Consultores</div>
              <div className="text-[0.68rem] text-text-muted uppercase tracking-[0.04em] mt-0.5">Carteira de Monitoria</div>
            </div>
          </div>
          <Field label="Usuário">
            <Input value={usuario} onChange={(e) => { setUsuario(e.target.value); setErro(false); }} autoFocus autoComplete="username" />
          </Field>
          <Field label="Senha">
            <Input type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(false); }} autoComplete="current-password" />
          </Field>
          {erro && <p role="alert" className="text-[0.8rem] text-danger mb-3">Usuário ou senha incorretos.</p>}
          <Button type="submit" variant="primary" className="w-full justify-center" disabled={!usuario.trim() || !senha}>
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
