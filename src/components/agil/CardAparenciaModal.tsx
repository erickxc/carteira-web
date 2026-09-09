import { useState } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { ModalShell } from '../ModalShell';
import { Button, Chip, Field } from '../../ui';
import { CAMPOS_CARD_OPCOES, parseCamposCard, serializeCamposCard, type CampoCard } from '../../utils/agilCamposCard';
import type { AgilBoard } from '../../types';

interface CardAparenciaModalProps {
  board: AgilBoard;
  onClose: () => void;
}

/** Configura quais campos aparecem no card da tarefa deste board — antes só
 *  existia escondido dentro de "Editar quadro" e ninguém achava. */
export function CardAparenciaModal({ board, onClose }: CardAparenciaModalProps) {
  const { atualizarAgilBoard } = useCarteira();
  const [campos, setCampos] = useState<CampoCard[]>(parseCamposCard(board.camposCard));
  const [saving, setSaving] = useState(false);

  function toggleCampo(campo: CampoCard) {
    setCampos((prev) => (prev.includes(campo) ? prev.filter((c) => c !== campo) : [...prev, campo]));
  }

  async function salvar() {
    setSaving(true);
    try {
      await atualizarAgilBoard(board.id, { camposCard: serializeCamposCard(campos) });
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a aparência do card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={`Aparência do card — ${board.nome}`}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); salvar(); }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </>
      }
    >
      <p className="text-[0.8rem] text-text-muted mb-3">
        Escolha quais campos aparecem no card da tarefa sem precisar abrir — vale só para este quadro.
      </p>
      <Field as="div" label="Campos visíveis no card">
        <div className="flex flex-wrap gap-2">
          {CAMPOS_CARD_OPCOES.map((c) => (
            <Chip key={c.key} variant="toggle" active={campos.includes(c.key)} onClick={() => toggleCampo(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>
    </ModalShell>
  );
}
