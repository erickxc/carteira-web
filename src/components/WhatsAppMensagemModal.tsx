import { useState, type FormEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { linkWhatsApp } from '../utils/whatsapp';
import { ModalShell } from './ModalShell';
import { Button, Field, Select, Textarea } from '../ui';
import { SEGMENTO_LABEL, type Contato } from '../types';

interface WhatsAppMensagemModalProps {
  contato: Contato;
  empresa: string;
  onClose: () => void;
}

/** Aplica as variáveis do modelo ({empresa}, {nome}, {cargo}) ao texto. */
function aplicarVariaveis(texto: string, empresa: string, contato: Contato): string {
  return texto
    .replaceAll('{empresa}', empresa)
    .replaceAll('{nome}', contato.nome || '')
    .replaceAll('{cargo}', contato.cargo || '');
}

/**
 * Escolhe uma mensagem automática (Modelo de material, cadastrado/editável em
 * Configurações) e abre o WhatsApp do contato já com o texto preenchido. O
 * texto continua editável aqui antes de enviar.
 */
export function WhatsAppMensagemModal({ contato, empresa, onClose }: WhatsAppMensagemModalProps) {
  const { modelos } = useCarteira();
  const [modeloId, setModeloId] = useState('');
  const [mensagem, setMensagem] = useState('');

  function escolherModelo(id: string) {
    setModeloId(id);
    const modelo = modelos.find((m) => m.id === id);
    setMensagem(modelo ? aplicarVariaveis(modelo.conteudo, empresa, contato) : '');
  }

  function abrir(e: FormEvent) {
    e.preventDefault();
    const link = linkWhatsApp(contato.telefone);
    if (!link) {
      toastError('Telefone inválido — informe DDD + número.');
      return;
    }
    const url = mensagem.trim() ? `${link}?text=${encodeURIComponent(mensagem)}` : link;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  }

  return (
    <ModalShell
      title={`WhatsApp — ${contato.nome || 'contato'}`}
      onClose={onClose}
      onSubmit={abrir}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary">
            <MessageCircle size={15} /> Abrir WhatsApp
          </Button>
        </>
      }
    >
      <Field label="Mensagem automática">
        <Select tone="modal" value={modeloId} onChange={(e) => escolherModelo(e.target.value)}>
          <option value="">— Sem mensagem (só abrir a conversa) —</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titulo} · {SEGMENTO_LABEL[m.segmento]}
            </option>
          ))}
        </Select>
      </Field>

      {modelos.length === 0 && (
        <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Nenhuma mensagem cadastrada. Cadastre/edite em Configurações → Modelos de material.
        </p>
      )}

      <Field label="Texto a enviar (editável)">
        <Textarea
          tone="modal"
          rows={5}
          placeholder="Digite ou escolha uma mensagem automática acima..."
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </Field>
    </ModalShell>
  );
}
