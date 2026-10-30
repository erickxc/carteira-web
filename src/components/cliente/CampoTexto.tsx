import { useState, type InputHTMLAttributes } from 'react';
import { Input, Textarea } from '../../ui';

/** Campo de texto que salva ao sair (blur), só se mudou. `key={valor}` no uso
 *  reinicia o rascunho quando o valor muda por fora (outra máquina, outro campo).
 *  Usado pelo bloco de produtos da ficha, que grava campo a campo. */
export function CampoTexto({ valor, onSalvar, multilinha, ...props }: {
  valor: string;
  onSalvar: (v: string) => void;
  multilinha?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [rascunho, setRascunho] = useState(valor);
  const sair = () => { if (rascunho.trim() !== valor.trim()) onSalvar(rascunho.trim()); };
  if (multilinha) {
    return <Textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} onBlur={sair} placeholder={props.placeholder} aria-label={props['aria-label']} />;
  }
  return <Input {...props} value={rascunho} onChange={(e) => setRascunho(e.target.value)} onBlur={sair} />;
}
