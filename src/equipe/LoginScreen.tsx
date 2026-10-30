import { useState, type FormEvent } from 'react';
import { autenticar, type Equipe } from './sessao';

const QTD_BARRAS = 84;

/** Campo de barras que sobe num ritmo até o dourado: a "carteira no ritmo" da marca. Determinístico. */
const BARRAS = Array.from({ length: QTD_BARRAS }, (_, i) => {
  const t = i / (QTD_BARRAS - 1);
  const altura = 7 + 76 * t ** 1.7 + 5 * Math.sin(t * 24) * (0.35 + t) + 2.5 * Math.sin(t * 61);
  return { altura: Math.max(3, altura), dourada: t > 0.84, opacidade: 0.1 + 0.3 * t };
});

const CAMPO =
  'w-full h-12 rounded-[10px] border border-white/20 bg-white/[0.05] px-3.5 text-[0.95rem] text-white caret-[#dabb6c] outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/35 focus:border-[#dabb6c] focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(218,187,108,0.18)]';

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
    <div className="login-tela relative min-h-screen overflow-hidden bg-[#0b0b0d] text-white flex flex-col">
      <div aria-hidden className="absolute bottom-0 right-0 left-0 md:left-[40%] h-[22vh] md:h-[86vh] flex items-end gap-[2px] md:gap-[4px] pointer-events-none">
        {BARRAS.map((b, i) => (
          <span
            key={i}
            className="login-barra flex-1 rounded-t-[2px]"
            style={{
              height: `${b.altura}%`,
              background: b.dourada ? '#dabb6c' : `rgba(255,255,255,${b.opacidade})`,
              animationDelay: `${i * 7}ms`,
            }}
          />
        ))}
      </div>

      <main className="relative z-10 flex-1 flex flex-col justify-center w-full max-w-[29rem] px-6 pt-8 pb-[26vh] md:pb-10 md:pl-[clamp(3rem,8vw,8rem)] md:pr-0 md:max-w-none md:w-[clamp(27rem,38%,38rem)]">
        <div className="flex items-center gap-3 mb-10 md:mb-14">
          <img src="/favicon.svg?v=2" alt="" className="w-10 h-10 rounded-[10px] ring-1 ring-white/20" />
          <div className="leading-tight">
            <div className="font-semibold text-[1rem]">2D Consultores</div>
            <div className="text-[0.82rem] text-white/65 mt-0.5">Carteira de Monitoria</div>
          </div>
        </div>

        <h1 className="text-[2.1rem] md:text-[3.25rem] font-semibold leading-[1.06] tracking-[-0.03em] text-balance">
          Quem precisa de você hoje?
        </h1>
        <p className="mt-3 mb-8 md:mb-10 text-[1rem] text-white/70">A carteira inteira, no ritmo.</p>

        <form onSubmit={entrar} noValidate className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium text-white/80">
            Usuário
            <input className={CAMPO} value={usuario} onChange={(e) => { setUsuario(e.target.value); setErro(''); }} autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(erro)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium text-white/80">
            Senha
            <input className={CAMPO} type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoComplete="current-password" aria-invalid={Boolean(erro)} />
          </label>

          {erro && <p role="alert" className="text-[0.88rem] text-[#ff9c8f]">{erro}</p>}

          <button
            type="submit"
            className="mt-1 h-12 rounded-[10px] border-0 bg-[#dabb6c] text-[#0b0b0d] text-[0.98rem] font-semibold cursor-pointer transition-[background-color,transform] duration-150 hover:bg-[#e8cf8c] active:translate-y-px outline-none focus-visible:shadow-[0_0_0_2px_#0b0b0d,0_0_0_4px_#dabb6c]"
          >
            Entrar
          </button>
        </form>
      </main>
    </div>
  );
}
