import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { Dropdown } from '../components/Dropdown';
import { exportarExcel } from '../utils/exportExcel';
import { mesesComDados } from '../utils/periodo';
import { toastError, toastSuccess } from '../utils/toast';
import { Button, Card, Th, Td } from '../ui';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PREVIEW = 100;

/** Módulo Relatórios — filtra os eventos de agenda do tipo Relatório (só esse
 * tipo — Reunião/Contato/Ligação não entram aqui, mesmo que o usuário edite as
 * categorias) por período/serviço/monitor/status e exporta para Excel (.xlsx). */
export default function RelatoriosPage() {
  const { agenda } = useCarteira();
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  // Restrito a Relatório na origem — mesmo padrão de match por palavra-chave
  // usado em outros lugares do app (tipos vêm de categorias editáveis).
  const relatorios = useMemo(() => agenda.filter((e) => /relat/i.test(e.type || '')), [agenda]);

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<string>(String(mesAtual)); // 'todos' = ano inteiro
  const [fServicos, setFServicos] = useState<string[]>([]);
  const [fMonitores, setFMonitores] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);

  const anos = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    relatorios.forEach((e) => { const d = parseISO(e.date); if (!isNaN(d.getTime())) s.add(d.getFullYear()); });
    return [...s].sort((a, b) => b - a);
  }, [relatorios, anoAtual]);

  const mesesDoAno = useMemo(() => mesesComDados(relatorios.map((e) => e.date), ano), [relatorios, ano]);

  const opcoes = useMemo(() => {
    const servicos = new Set<string>(), monitores = new Set<string>(), status = new Set<string>();
    relatorios.forEach((e) => {
      (e.servicos ?? []).forEach((s) => servicos.add(s));
      if (e.monitor) monitores.add(e.monitor);
      if (e.status) status.add(e.status);
    });
    const ord = (set: Set<string>) => [...set].sort();
    return { servicos: ord(servicos), monitores: ord(monitores), status: ord(status) };
  }, [relatorios]);

  const filtrados = useMemo(() => {
    return relatorios
      .filter((e) => {
        const d = parseISO(e.date);
        if (isNaN(d.getTime())) return false;
        if (d.getFullYear() !== ano) return false;
        if (mes !== 'todos' && d.getMonth() !== Number(mes)) return false;
        if (fStatus.length && !fStatus.includes(e.status)) return false;
        if (fMonitores.length && !fMonitores.includes(e.monitor || '')) return false;
        if (fServicos.length && !(e.servicos ?? []).some((s) => fServicos.includes(s))) return false;
        return true;
      })
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [relatorios, ano, mes, fServicos, fMonitores, fStatus]);

  const periodoLabel = mes === 'todos' ? `${ano}` : `${MESES[Number(mes)]}/${ano}`;

  function linha(e: (typeof filtrados)[number]) {
    return {
      Data: format(parseISO(e.date), 'dd/MM/yyyy'),
      Hora: e.time || '',
      Cliente: e.clientName || '',
      Tipo: e.type || '',
      Serviços: (e.servicos ?? []).join(', '),
      Status: e.status || '',
      Monitor: e.monitor || '',
      Assunto: e.subject || '',
      'Duração (min)': e.duracao ?? '',
      Observação: e.description || '',
    };
  }

  async function exportar() {
    if (filtrados.length === 0) { toastError('Nada para exportar com esses filtros.'); return; }
    setExportando(true);
    try {
      const nome = `relatorio-eventos-${mes === 'todos' ? ano : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}`}.xlsx`;
      await exportarExcel(nome, filtrados.map(linha), 'Eventos');
      toastSuccess(`Excel gerado: ${filtrados.length} registro(s).`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao gerar o Excel.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Exporte relatórios para Excel, filtrando por período, serviço, monitor e status.</p>
        </div>
        <Button variant="primary" onClick={exportar} disabled={exportando || filtrados.length === 0} style={{ fontSize: '0.95rem', padding: '0.7rem 1.4rem', fontWeight: 600 }}>
          <Download size={18} /> {exportando ? 'Gerando...' : `Exportar Excel (${filtrados.length})`}
        </Button>
      </div>

      <Card flat className="mb-4" style={{ marginTop: '1.25rem' }}>
        <div className="filter-grid">
          {/* Só os meses que têm relatório no ano escolhido (+ o mês corrente):
              listar os 12 fixos oferecia meses anteriores ao início da base. */}
          <Dropdown label="Mês" options={[{ value: 'todos', label: 'Ano inteiro' }, ...mesesDoAno.map((i) => ({ value: String(i), label: MESES[i] }))]} value={mes} onChange={(v) => setMes(v as string)} />
          <Dropdown label="Ano" options={anos.map((a) => ({ value: String(a), label: String(a) }))} value={String(ano)} onChange={(v) => setAno(Number(v))} />
          <Dropdown label="Serviço" multiple options={opcoes.servicos.map((s) => ({ value: s, label: s }))} value={fServicos} onChange={(v) => setFServicos(v as string[])} />
          <Dropdown label="Monitor" multiple options={opcoes.monitores.map((m) => ({ value: m, label: m }))} value={fMonitores} onChange={(v) => setFMonitores(v as string[])} />
          <Dropdown label="Status" multiple options={opcoes.status.map((s) => ({ value: s, label: s }))} value={fStatus} onChange={(v) => setFStatus(v as string[])} />
        </div>
      </Card>

      <Card flat style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-header" style={{ padding: '0.9rem 1.1rem 0' }}>
          <h3>Prévia <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {periodoLabel}</span></h3>
          <span className="text-text-muted" style={{ fontSize: 12 }}>{filtrados.length} registro(s)</span>
        </div>
        {filtrados.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={26} className="text-text-muted" />
            Nenhum relatório no período/filtros escolhidos.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full border-collapse text-[0.86rem]">
              <thead><tr>
                <Th>Data</Th><Th>Hora</Th><Th>Cliente</Th><Th>Tipo</Th><Th>Serviços</Th><Th>Status</Th><Th>Monitor</Th><Th>Assunto</Th>
              </tr></thead>
              <tbody>
                {filtrados.slice(0, PREVIEW).map((e) => (
                  <tr key={e.id} className="group [&:last-child>td]:border-b-0">
                    <Td first style={{ whiteSpace: 'nowrap' }}>{format(parseISO(e.date), 'dd/MM/yy')}</Td>
                    <Td>{e.time || '—'}</Td>
                    <Td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.clientName || '—'}</Td>
                    <Td>{e.type || '—'}</Td>
                    <Td className="text-text-muted">{(e.servicos ?? []).join(', ') || '—'}</Td>
                    <Td>{e.status || '—'}</Td>
                    <Td className="text-text-muted">{e.monitor || '—'}</Td>
                    <Td className="text-text-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > PREVIEW && (
              <p className="text-text-muted" style={{ fontSize: 12, padding: '0.6rem 1.1rem' }}>Prévia dos primeiros {PREVIEW}. O Excel inclui os {filtrados.length}.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
