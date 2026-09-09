import { useState, type FormEvent } from 'react';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input } from '../../ui';

interface WorkspacePinModalProps {
  workspaceNome: string;
  onConfirm: (pin: string) => boolean;
  onClose: () => void;
}

/** PIN é barreira leve de UI (ver WorkspaceFormModal) — não segurança real. */
export function WorkspacePinModal({ workspaceNome, onConfirm, onClose }: WorkspacePinModalProps) {
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (onConfirm(pin)) { onClose(); return; }
    setErro(true);
  }

  return (
    <ModalShell
      title={`PIN — ${workspaceNome}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary">Entrar</Button>
        </>
      }
    >
      <Field label="Digite o PIN de 4 dígitos">
        <Input
          tone="modal"
          autoFocus
          inputMode="numeric"
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErro(false); }}
        />
      </Field>
      {erro && <p className="text-danger text-[0.78rem]">PIN incorreto.</p>}
    </ModalShell>
  );
}
