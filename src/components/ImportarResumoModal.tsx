import { useState, type FormEvent } from 'react';
import { FileDown, Search } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { Button, Field, Textarea } from '../ui';
import { identificarReuniao } from '../api/client';
import { gerarRelatorioReuniaoPdf } from '../utils/relatorioReuniaoPdf';
import { toastError } from '../utils/toast';
import type { ClienteCandidato, SecoesReuniao } from '../types';

interface ImportarResumoModalProps {
  onClose: () => void;
}

/**
 * Cola o .txt exportado da transcrição da reunião → identifica o cliente da
 * carteira (por nome/contato citado, sem IA — ver server/identificarReuniao.cjs)
 * → extrai Resumo/Tarefas/Capítulos/Bloco de Notas (a transcrição já escreve
 * isso pronto, aqui é recorte, não geração) → gera o PDF no layout "RELATÓRIO
 * 2D - ALVOS". "Perguntas-chave" não vem da transcrição — fica em branco pra
 * preencher à mão, porque inventar essa seção seria fabricar conteúdo.
 */
export function ImportarResumoModal({ onClose }: ImportarResumoModalProps) {
  const [texto, setTexto] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [candidatos, setCandidatos] = useState<ClienteCandidato[] | null>(null);
  const [secoes, setSecoes] = useState<SecoesReuniao | null>(null);
  const [clienteEscolhido, setClienteEscolhido] = useState('');
  const [perguntasChave, setPerguntasChave] = useState('');

  async function analisar() {
    if (!texto.trim()) { toastError('Cole o texto da transcrição primeiro.'); return; }
    setAnalisando(true);
    try {
      const r = await identificarReuniao(texto);
      setCandidatos(r.candidatos);
      setSecoes(r.secoes);
      setClienteEscolhido(r.candidatos[0]?.empresa ?? '');
      setPerguntasChave('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao analisar o texto.');
    } finally {
      setAnalisando(false);
    }
  }

  function gerarPdf() {
    if (!secoes) return;
    if (!clienteEscolhido.trim()) { toastError('Selecione ou digite o cliente.'); return; }
    gerarRelatorioReuniaoPdf({
      empresa: clienteEscolhido.trim(),
      data: secoes.linhaData,
      resumo: secoes.resumo,
      capitulos: secoes.capitulos,
      tarefas: secoes.tarefas,
      perguntasChave,
      blocoNotas: secoes.blocoNotas,
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerarPdf();
  }

  return (
    <ModalShell
      title="Importar resumo de reunião"
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          {secoes && (
            <Button variant="primary" onClick={gerarPdf}>
              <FileDown size={15} /> Gerar PDF
            </Button>
          )}
        </>
      }
    >
      <p className="text-text-muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 12 }}>
        Cole o texto exportado da transcrição (Resumo/Tarefas/Principais Pontos de Discussão). O cliente é identificado
        por nome ou contato citado — confirme antes de gerar, é sugestão, não decisão automática.
      </p>

      <Field label="Texto da transcrição">
        <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui o .txt da reunião..." />
      </Field>

      <Button variant="secondary" onClick={analisar} disabled={analisando} style={{ marginBottom: 16 }}>
        <Search size={15} /> {analisando ? 'Analisando...' : 'Analisar'}
      </Button>

      {candidatos && (
        <Field as="div" label="Cliente identificado">
          {candidatos.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>
              Nenhum cliente da carteira bateu com o texto. Digite o nome manualmente:
            </p>
          ) : null}
          <div className="flex flex-col gap-[0.35rem]">
            {candidatos.map((c) => (
              <label key={c.id} className="check-row" style={{ textTransform: 'none' }}>
                <input
                  type="radio"
                  name="cliente-candidato"
                  checked={clienteEscolhido === c.empresa}
                  onChange={() => setClienteEscolhido(c.empresa)}
                />
                {c.empresa} <span className="text-text-muted" style={{ fontSize: 12 }}>(bateu: {c.motivos.join(', ')})</span>
              </label>
            ))}
          </div>
          <input
            style={{ marginTop: 8 }}
            className="w-full border border-border-strong rounded-sm text-[0.875rem] bg-bg px-[0.7rem] py-[0.55rem]"
            value={clienteEscolhido}
            onChange={(e) => setClienteEscolhido(e.target.value)}
            placeholder="Nome do cliente para o relatório"
          />
        </Field>
      )}

      {secoes && (
        <>
          <Field label="Perguntas-chave (não vem da transcrição — opcional)">
            <Textarea rows={3} value={perguntasChave} onChange={(e) => setPerguntasChave(e.target.value)} placeholder="A transcrição não traz isso pronto — preencha se fizer sentido." />
          </Field>

          <Field as="div" label={`Prévia — Capítulos e tópicos (${secoes.capitulos.length})`}>
            <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13 }}>
              {secoes.capitulos.map((c, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <strong>{c.titulo}</strong>
                  <div className="text-text-muted">{c.texto}</div>
                </div>
              ))}
            </div>
          </Field>
        </>
      )}
    </ModalShell>
  );
}
