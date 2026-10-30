import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, SecaoLabel } from '../../ui';
import { formatarCNPJ } from '../../utils/cnpj';
import { fiscalDaLoja, type LojaNoRetrato, type RetratoDw } from '../../utils/produtosNoDw';
import { vencimentoCert } from '../../utils/vencimentoCert';
import type { Cliente } from '../../types';

const COR_CERT = {
  vencido: 'text-[color:var(--danger-fg)] font-semibold',
  perto: 'text-[color:var(--warning-fg)] font-semibold',
  ok: '',
  sem: 'text-text-muted',
};

/** Vencimento do certificado com a cor no próprio texto (design 1.6). */
export function ValorCert({ data }: { data: string | null | undefined }) {
  const { texto, nivel } = vencimentoCert(data);
  return <span className={COR_CERT[nivel]}>{texto}</span>;
}

const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <span className="text-text-muted">{rotulo}: <span className="text-text-secondary">{children}</span></span>
);

/** O que o DW e a Receita dizem da loja: só o campo que existe, para a linha não encher de traço. */
function DadosFiscais({ fiscal }: { fiscal: LojaNoRetrato }) {
  const situacao = fiscal.receita?.situacao;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.82rem]">
      {situacao && (
        <Campo rotulo="Situação CNPJ">
          <span className={/^ativa$/i.test(situacao) ? '' : 'text-[color:var(--danger-fg)] font-semibold'}>{situacao}</span>
        </Campo>
      )}
      <Campo rotulo="Certificado"><ValorCert data={fiscal.certificadoValidade} /></Campo>
      {fiscal.telefone && <Campo rotulo="Telefone">{fiscal.telefone}</Campo>}
      {fiscal.email && <Campo rotulo="E-mail">{fiscal.email}</Campo>}
      {fiscal.grupoFiscal && <Campo rotulo="Grupo fiscal">{fiscal.grupoFiscal.nome}</Campo>}
    </span>
  );
}

/**
 * Aba Lojas: as lojas físicas deste atendimento e os outros atendimentos da rede.
 * Quem chama só mostra a aba se houver alguma das duas; a seção vazia não aparece.
 */
export function LojasFicha({ cliente, lojasDoGrupo, retrato }: { cliente: Cliente; lojasDoGrupo: Cliente[]; retrato?: RetratoDw | null }) {
  // Repassa o `state`: o "Voltar" da ficha irmã leva de volta à mesma origem, não à Carteira.
  const { state } = useLocation();
  const lojas = cliente.lojasCadastro ?? [];
  const irmas = lojasDoGrupo.filter((l) => l.id !== cliente.id);

  return (
    <Card>
      {lojas.length > 0 && (
        <>
          <SecaoLabel>Lojas deste atendimento</SecaoLabel>
          {lojas.map((l, i) => {
            const fiscal = fiscalDaLoja(retrato, l.cnpj);
            return (
              <p key={i} style={{ fontSize: 13, margin: '0 0 6px' }}>
                <strong>{l.nome}</strong>
                {l.cnpj && <span className="text-text-secondary"> · {formatarCNPJ(l.cnpj)}</span>}
                {l.endereco && <span className="text-text-muted" style={{ display: 'block' }}>{l.endereco}</span>}
                {fiscal && <DadosFiscais fiscal={fiscal} />}
              </p>
            );
          })}
        </>
      )}
      {irmas.length > 0 && (
        <>
          <SecaoLabel>Outros atendimentos da rede</SecaoLabel>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5" style={{ fontSize: 13 }}>
            {irmas.map((l) => (
              <Link key={l.id} to={`/clientes/${l.id}`} state={state}>
                {l.empresa.replace(`${cliente.grupo} - `, '') || l.empresa}
              </Link>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
