import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { SelectField } from '../SelectField';
import { Button, Field, Input, Textarea } from '../../ui';
import type { AgilCampoPersonalizado, AgilCampoTipo } from '../../types';

interface CamposPersonalizadosManagerModalProps {
  boardId: string;
  boardNome: string;
  onClose: () => void;
}

const TIPO_OPCOES: { value: AgilCampoTipo; label: string }[] = [
  { value: 'texto', label: 'Texto/número livre' },
  { value: 'numero', label: 'Número' },
  { value: 'data', label: 'Data' },
  { value: 'selecao', label: 'Lista de opções' },
  { value: 'pessoa', label: 'Pessoa (monitor)' },
];

/** Gerenciador dos campos personalizados DESTE board — cada quadro define os
 *  seus (não é global como Frente). */
export function CamposPersonalizadosManagerModal({ boardId, boardNome, onClose }: CamposPersonalizadosManagerModalProps) {
  const { agilCamposPersonalizados, criarAgilCampoPersonalizado, atualizarAgilCampoPersonalizado, removerAgilCampoPersonalizado } = useCarteira();
  const campos = agilCamposPersonalizados.filter((c) => c.boardId === boardId).sort((a, b) => a.ordem - b.ordem);

  const [editandoId, setEditandoId] = useState<'novo' | string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<AgilCampoTipo>('texto');
  const [opcoesTexto, setOpcoesTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  function iniciarNovo() {
    setEditandoId('novo');
    setNome('');
    setTipo('texto');
    setOpcoesTexto('');
  }

  function iniciarEdicao(c: AgilCampoPersonalizado) {
    setEditandoId(c.id);
    setNome(c.nome);
    setTipo(c.tipo);
    setOpcoesTexto((c.opcoes ?? []).join('\n'));
  }

  async function salvar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    const opcoes = tipo === 'selecao'
      ? opcoesTexto.split('\n').map((o) => o.trim()).filter(Boolean)
      : undefined;
    setSalvando(true);
    try {
      if (editandoId === 'novo') {
        await criarAgilCampoPersonalizado({ boardId, nome: nomeLimpo, tipo, opcoes });
      } else if (editandoId) {
        await atualizarAgilCampoPersonalizado(editandoId, { nome: nomeLimpo, tipo, opcoes });
      }
      setEditandoId(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o campo.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: AgilCampoPersonalizado) {
    if (!(await confirmDialog(`Remover o campo "${c.nome}"? Valores já preenchidos em tarefas não são apagados, só deixam de aparecer.`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerAgilCampoPersonalizado(c.id);
  }

  return (
    <ModalShell title={`Campos personalizados — ${boardNome}`} onClose={onClose} onSubmit={(e) => e.preventDefault()} footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      <p className="text-[0.8rem] text-text-muted mb-3">
        Campos que só existem neste quadro (ex.: "Valor do contrato", "Cliente afetado") — cada board tem os seus.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {campos.length === 0 && editandoId !== 'novo' && <div className="empty-state">Nenhum campo ainda.</div>}
        {campos.map((c) => (
          <div key={c.id}>
            {editandoId === c.id ? (
              <div className="flex flex-col gap-2 p-2.5 rounded bg-bg border border-border-strong">
                <Input tone="modal" autoFocus placeholder="Nome do campo" value={nome} onChange={(e) => setNome(e.target.value)} />
                <SelectField label="Tipo" value={tipo} onChange={(v) => setTipo(v as AgilCampoTipo)} options={TIPO_OPCOES} />
                {tipo === 'selecao' && (
                  <Field label="Opções (uma por linha)">
                    <Textarea tone="modal" value={opcoesTexto} onChange={(e) => setOpcoesTexto(e.target.value)} rows={3} />
                  </Field>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setEditandoId(null)}>Cancelar</Button>
                  <Button variant="primary" onClick={salvar} disabled={salvando || !nome.trim()}>Salvar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-bg border border-border">
                <span className="flex-1 text-[0.85rem] text-text-primary truncate">{c.nome}</span>
                <span className="text-[0.68rem] text-text-muted">{TIPO_OPCOES.find((t) => t.value === c.tipo)?.label}</span>
                <Button variant="secondary" size="icon" onClick={() => iniciarEdicao(c)} title="Editar" aria-label={`Editar campo ${c.nome}`}><Pencil size={13} /></Button>
                <Button variant="danger" size="icon" onClick={() => excluir(c)} title="Remover" aria-label={`Remover campo ${c.nome}`}><Trash2 size={13} /></Button>
              </div>
            )}
          </div>
        ))}

        {editandoId === 'novo' && (
          <div className="flex flex-col gap-2 p-2.5 rounded bg-bg border border-border-strong">
            <Input tone="modal" autoFocus placeholder="Nome do campo" value={nome} onChange={(e) => setNome(e.target.value)} />
            <SelectField label="Tipo" value={tipo} onChange={(v) => setTipo(v as AgilCampoTipo)} options={TIPO_OPCOES} />
            {tipo === 'selecao' && (
              <Field label="Opções (uma por linha)">
                <Textarea tone="modal" value={opcoesTexto} onChange={(e) => setOpcoesTexto(e.target.value)} rows={3} />
              </Field>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditandoId(null)}>Cancelar</Button>
              <Button variant="primary" onClick={salvar} disabled={salvando || !nome.trim()}>Adicionar</Button>
            </div>
          </div>
        )}
      </div>

      {editandoId === null && (
        <Button variant="secondary" onClick={iniciarNovo}>
          <Plus size={14} /> Novo campo
        </Button>
      )}
    </ModalShell>
  );
}
