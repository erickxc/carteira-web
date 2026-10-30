import { Link, useLocation } from 'react-router-dom';
import { Card, SecaoLabel } from '../../ui';
import { formatarCNPJ } from '../../utils/cnpj';
import type { Cliente } from '../../types';

/**
 * Aba Lojas: as lojas físicas deste atendimento e os outros atendimentos da rede.
 * Quem chama só mostra a aba se houver alguma das duas; a seção vazia não aparece.
 */
export function LojasFicha({ cliente, lojasDoGrupo }: { cliente: Cliente; lojasDoGrupo: Cliente[] }) {
  // Repassa o `state`: o "Voltar" da ficha irmã leva de volta à mesma origem, não à Carteira.
  const { state } = useLocation();
  const lojas = cliente.lojasCadastro ?? [];
  const irmas = lojasDoGrupo.filter((l) => l.id !== cliente.id);

  return (
    <Card>
      {lojas.length > 0 && (
        <>
          <SecaoLabel>Lojas deste atendimento</SecaoLabel>
          {lojas.map((l, i) => (
            <p key={i} style={{ fontSize: 13, margin: '0 0 6px' }}>
              <strong>{l.nome}</strong>
              {l.cnpj && <span className="text-text-secondary"> · {formatarCNPJ(l.cnpj)}</span>}
              {l.endereco && <span className="text-text-muted" style={{ display: 'block' }}>{l.endereco}</span>}
            </p>
          ))}
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
