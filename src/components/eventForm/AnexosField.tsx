import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { urlAnexo } from '../../api/client';
import { Button, Field } from '../../ui';
import type { Anexo } from '../../types';

interface AnexosFieldProps {
  editando: boolean;
  attachments: Anexo[];
  uploading: boolean;
  onRemove: (anexo: Anexo) => void;
  onFilesSelected: (files: FileList | null) => void;
}

/** Bloco "Anexos" do formulário de evento — upload só disponível na edição
 *  (precisa do id do evento já existir pra associar o arquivo). */
export function AnexosField({ editando, attachments, uploading, onRemove, onFilesSelected }: AnexosFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Field as="div" label="Anexos">
      {!editando ? (
        <p className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Salve o evento primeiro para anexar arquivos.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {attachments.map((anexo) => (
              <span key={anexo.id} className="attachment-chip">
                <Paperclip size={12} />
                <a href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">{anexo.originalName}</a>
                <button type="button" onClick={() => onRemove(anexo)} aria-label="Remover anexo"><X size={12} /></button>
              </span>
            ))}
            {attachments.length === 0 && (<span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum anexo.</span>)}
          </div>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip size={14} /> {uploading ? 'Enviando...' : 'Adicionar arquivo'}
          </Button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => onFilesSelected(e.target.files)} />
        </>
      )}
    </Field>
  );
}
