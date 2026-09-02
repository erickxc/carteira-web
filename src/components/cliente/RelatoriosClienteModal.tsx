import { useMemo, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { Dropdown } from '../Dropdown';
import { ModalShell } from '../ModalShell';
import { exportarExcel } from '../../utils/exportExcel';
import { mesesComDados } from '../../utils/periodo';
import { toastError, toastSuccess } from '../../utils/toast';
import { Button, Th, Td } from '../../ui';
import type { Cliente } from '../../types';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PREVIEW = 100;

interface RelatoriosClienteModalProps {
  cliente: Cliente;
  onClose: () => void;
}

/**
 * Relatórios DE UM CLIENTE — o que era o módulo `/relatorios` (tela própria na
 * sidebar, com a carteira inteira e filtro de monitor). Virou um botão no
 * cadastro do cliente por decisão do usuário: na prática a pergunta é sempre
 * "quais relatórios deste cliente", então filtrar cliente na tela toda era um
 * passo a mais, e o filtro de monitor perdia sentido (o monitor é o do
 * cliente). Período/serviço/status continuam, e a exportação Excel é a mesma.
 *
 * Só eventos do tipo Relatório entram (match por palavra-chave, porque os
 * tipos vêm de categorias editáveis) — igual ao módulo antigo.
 */
export function RelatoriosClienteModal({ cliente, onClose }: RelatoriosClienteModalProps) {
  const { agenda } = useCarteira();
  const anoAtual = new Date().getFullYear();

  const relatorios = useMemo(
    () => agenda.filter((e) => e.clientId === cliente.id && /relat/i.test(e.type || '')),
    [agenda, cliente.id]
  );

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<string>('todos');
  const [fServicos, setFServicos] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);

  const anos = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    relatorios.forEach((e) => { const d = parseISO(e.date); if (!isNaN(d.getTime())) s.add(d.getFullYear()); });
    return [...s].sort((a, b) => b - a);
  }, [relatorios, anoAtual]);

  const mesesDoAno = useMemo(() => mesesComDados(relatorios.map((e) => e.date), ano), [relatorios, ano]);

  const opcoes = useMemo(() => {
    const servicos = new Set<string>(), status = new Set<string>();
    relatorios.forEach((e) => {
      (e.servicos ?? []).forEach((s) => servicos.add(s));
      if (e.status) status.add(e.status);
    });
    return { servicos: [...servicos].sort(), status: [...status].sort() };
  }, [relatorios]);

  const filtrados = useMemo(() => relatorios
    .filter((e) => {
      const d = parseISO(e.date);
      if (isNaN(d.getTime())) return false;
      if (d.getFullYear() !== ano) return false;
      if (mes !== 'todos' && d.getMonth() !== Number(mes)) return false;
      if (fStatus.length && !fStatus.includes(e.status)) return false;
      if (fServicos.length && !(e.servicos ?? []).some((s) => fServicos.includes(s))) return false;
      return true;
    })
    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
  [relatorios, ano, mes, fServicos, fStatus]);

  const periodoLabel = mes === 'todos' ? `${ano}` : `${MESES[Number(mes)]}/${ano}`;

  async function exportar() {
    if (filtrados.length === 0) { toastError('Nada para exportar com esses filtros.'); return; }
    setExportando(true);
    try {
      const sufixo = mes === 'todos' ? String(ano) : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}`;
      // Nome do arquivo com o cliente: antes era um export da carteira inteira,
      // agora cada arquivo é de um cliente e precisa se identificar sozinho.
      const slug = cliente.empresa.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      await exportarExcel(`relatorios-${slug}-${sufixo}.xlsx`, filtrados.map((e) => ({
        Data: format(parseISO(e.date), 'dd/MM/yyyy'),
        Hora: e.time || '',
        Cliente: e.clientName || cliente.empresa,
        Tipo: e.type || '',
        Serviços: (e.servicos ?? []).join(', '),
        Status: e.status || '',
        Monitor: (e.monitores ?? []).join(', '),
        Assunto: e.subject || '',
        'Duração (min)': e.duracao ?? '',
        Observação: e.description || '',
      })), 'Relatórios');
      toastSuccess(`Excel gerado: ${filtrados.length} registro(s).`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao gerar o Excel.');
    } finally {
      setExportando(false);
    }
  }

  function submeter(e: FormEvent) {
    e.preventDefault();
    void exportar();
  }

  return (
    <ModalShell
      title={`Relatórios · ${cliente.empresa}`}
      onClose={onClose}
      onSubmit={submeter}
      size="xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button variant="primary" onClick={exportar} disabled={exportando || filtrados.length === 0}>
            <Download size={16} /> {exportando ? 'Gerando...' : `Exportar Excel (${filtrados.length})`}
          </Button>
        </>
      )}
    >
      <div className="filter-grid" style={{ marginBottom: 14 }}>
        <Dropdown label="Mês" options={[{ value: 'todos', label: 'Ano inteiro' }, ...mesesDoAno.map((i) => ({ value: String(i), label: MESES[i] }))]} value={mes} onChange={(v) => setMes(v as string)} />
        <Dropdown label="Ano" options={anos.map((a) => ({ value: String(a), label: String(a) }))} value={String(ano)} onChange={(v) => setAno(Number(v))} />
        <Dropdown label="Serviço" multiple options={opcoes.servicos.map((s) => ({ value: s, label: s }))} value={fServicos} onChange={(v) => setFServicos(v as string[])} />
        <Dropdown label="Status" multiple options={opcoes.status.map((s) => ({ value: s, label: s }))} value={fStatus} onChange={(v) => setFStatus(v as string[])} />
      </div>

      <div className="section-header">
        <h3>Prévia <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {periodoLabel}</span></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{filtrados.length} registro(s)</span>
      </div>

      {filtrados.length === 0 ? (
        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <FileSpreadsheet size={26} className="text-text-muted" />
          Nenhum relatório deste cliente no período/filtros escolhidos.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full border-collapse text-[0.86rem]">
            <thead><tr>
              <Th>Data</Th><Th>Hora</Th><Th>Serviços</Th><Th>Status</Th><Th>Monitor</Th><Th>Assunto</Th>
            </tr></thead>
            <tbody>
              {filtrados.slice(0, PREVIEW).map((e) => (
                <tr key={e.id} className="group [&:last-child>td]:border-b-0">
                  <Td first style={{ whiteSpace: 'nowrap' }}>{format(parseISO(e.date), 'dd/MM/yy')}</Td>
                  <Td>{e.time || '—'}</Td>
                  <Td className="text-text-muted">{(e.servicos ?? []).join(', ') || '—'}</Td>
                  <Td>{e.status || '—'}</Td>
                  <Td className="text-text-muted">{(e.monitores ?? []).join(', ') || '—'}</Td>
                  <Td className="text-text-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > PREVIEW && (
            <p className="text-text-muted" style={{ fontSize: 12, paddingTop: 8 }}>Prévia dos primeiros {PREVIEW}. O Excel inclui os {filtrados.length}.</p>
          )}
        </div>
      )}
    </ModalShell>
  );
}
