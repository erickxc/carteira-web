import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { cnpjIncompleto } from '../../utils/lojas';
import { patchCadastro } from '../../utils/patchCadastro';
import { toastError } from '../../utils/toast';
import { ModalShell } from '../ModalShell';
import { Button } from '../../ui';
import { CadastroCliente } from './CadastroCliente';
import type { Cliente } from '../../types';

/**
 * Edição do cadastro num painel: tudo fica no rascunho e vai numa chamada só em
 * Salvar; Cancelar descarta. A exceção é o bloco de produtos, que grava sozinho.
 * Por isso o patch compara com o cliente de QUANDO ABRIU, e não com o `cliente`
 * vivo: um produto gravado durante a edição (ou um campo mudado em outra máquina)
 * deixa o vivo diferente do rascunho, e o Salvar desfaria essa mudança.
 */
export function EditarCadastroModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const { atualizarCliente } = useCarteira();
  const [original] = useState(cliente);
  const [rascunho, setRascunho] = useState(cliente);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!rascunho.empresa.trim()) {
      toastError('O nome não pode ficar vazio.');
      return;
    }
    const rel = rascunho.relatorioCadencia;
    const patch = patchCadastro(original, {
      ...rascunho,
      empresa: rascunho.empresa.trim(),
      endereco: rascunho.endereco?.trim(),
      motivoPausa: rascunho.motivoPausa?.trim(),
      relatorioCadencia: rel && { ...rel, numero: Math.max(1, rel.numero || 1) },
    });
    // Só confere as lojas se mexeram nelas: CNPJ antigo incompleto não pode travar
    // a troca de outro campo. Incompleto nunca sai daqui: o servidor o gravaria vazio.
    if (patch.lojasCadastro?.some((l) => cnpjIncompleto(l.cnpj))) {
      toastError('CNPJ incompleto: cada loja precisa de 14 dígitos.');
      return;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSalvando(true);
    try {
      await atualizarCliente(cliente.id, patch);
      onClose();
    } catch (err) {
      setSalvando(false);
      toastError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.');
    }
  }

  return (
    <ModalShell
      title={`Editar cadastro · ${cliente.empresa}`}
      onClose={onClose}
      onSubmit={salvar}
      size="xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" carregando={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <CadastroCliente cliente={cliente} valor={rascunho} onChange={setRascunho} />
    </ModalShell>
  );
}
