// Som de notificação via Web Audio API — sem arquivo de áudio (funciona
// offline, nada pra baixar/servir). Dois "beeps" curtos e agradáveis.
//
// Política de autoplay: navegadores só deixam tocar áudio depois de alguma
// interação do usuário. Como o lembrete dispara por timer (não por clique),
// preparamos o AudioContext no primeiro clique/tecla (`prepararSom`) — a partir
// daí `tocarSomNotificacao` funciona mesmo disparado pelo polling.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Registra listeners que "destravam" o áudio na primeira interação. Chamar 1x. */
export function prepararSom(): void {
  if (typeof window === 'undefined') return;
  const destravar = () => {
    getCtx()?.resume?.().catch(() => {});
    window.removeEventListener('pointerdown', destravar);
    window.removeEventListener('keydown', destravar);
  };
  window.addEventListener('pointerdown', destravar);
  window.addEventListener('keydown', destravar);
}

/** Toca o som de notificação. Silencioso se o navegador ainda não liberou áudio. */
export function tocarSomNotificacao(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t0 = c.currentTime;
  // Duas notas curtas (A5 → D6), sobem levemente = "ding-dong" discreto.
  [880, 1174.66].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const inicio = t0 + i * 0.18;
    gain.gain.setValueAtTime(0.0001, inicio);
    gain.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.17);
    osc.connect(gain).connect(c.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.18);
  });
}
