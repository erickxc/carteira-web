import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { Bell, CalendarPlus, FileSpreadsheet, Pencil, PhoneIncoming, Trash2 } from 'lucide-react';
import { Button, Card } from '../../ui';
import { MenuMais } from '../MenuMais';
import type { Cliente } from '../../types';

interface CabecalhoFichaProps {
  cliente: Cliente;
  onNovoEvento: () => void;
  onLembrete: () => void;
  onContatoCliente: () => void;
  onEditar: () => void;
  onRelatorios: () => void;
  /** A confirmação fica em quem chama, junto da exclusão. */
  onExcluir: () => void;
}

/** Topo da ficha: quem é o cliente em texto (sem pílula nem ponto colorido) e o que dá para fazer. */
export function CabecalhoFicha({ cliente, onNovoEvento, onLembrete, onContatoCliente, onEditar, onRelatorios, onExcluir }: CabecalhoFichaProps) {
  // Mesma regra de `isClienteAtivo`: o dia escolhido ainda é de pausa.
  const pausaAte = parseISO(cliente.pausadoAte ?? '');
  const pausa = isValid(pausaAte) && differenceInCalendarDays(pausaAte, new Date()) >= 0 && `Pausado até ${format(pausaAte, 'dd/MM')}`;
  const situacao = [cliente.grupo && `Rede ${cliente.grupo}`, cliente.monitor, cliente.local, cliente.status, cliente.estado, pausa].filter(Boolean).join(' · ');

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="flex-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{cliente.empresa}</h1>
          <span className="text-text-muted" style={{ fontSize: 13 }}>{situacao}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onNovoEvento}><CalendarPlus size={15} /> Novo evento</Button>
          <Button variant="secondary" onClick={onLembrete}><Bell size={15} /> Lembrete</Button>
          <Button variant="secondary" onClick={onContatoCliente} title="Registrar que o cliente entrou em contato"><PhoneIncoming size={15} /> Cliente entrou em contato</Button>
          <Button variant="secondary" onClick={onEditar}><Pencil size={15} /> Editar cadastro</Button>
          <MenuMais itens={[
            { rotulo: <><FileSpreadsheet size={14} /> Relatórios</>, onClick: onRelatorios },
            { rotulo: <><Trash2 size={14} /> Excluir</>, onClick: onExcluir, perigo: true },
          ]} />
        </div>
      </div>
    </Card>
  );
}
