import { describe, expect, it } from 'vitest';
import { limparStreamAtaIA } from './limparStreamAtaIA';

describe('limparStreamAtaIA', () => {
  it('remove o cabeçalho do JSON e deixa só o texto sendo escrito', () => {
    expect(limparStreamAtaIA('{"oQueFoiTratado": "Reunião revis')).toBe('Reunião revis');
  });

  it('quebra em seção "Decisões" quando o campo seguinte começa a streamar', () => {
    const buffer = '{"oQueFoiTratado": "Tópico um.\\nTópico dois.", "decisoes": "Aprovada a nova';
    expect(limparStreamAtaIA(buffer)).toBe('Tópico um.\nTópico dois.\n\nDecisões:\nAprovada a nova');
  });

  it('quebra em seção "Próximos passos" quando o campo seguinte começa a streamar', () => {
    const buffer = '{"oQueFoiTratado": "Tópico.", "decisoes": "", "proximosPassos": "[Erick] enviar';
    expect(limparStreamAtaIA(buffer)).toBe('Tópico.\n\nDecisões:\n\n\nPróximos passos:\n[Erick] enviar');
  });

  it('remove aspas/chave de fechamento quando o JSON terminou de verdade', () => {
    expect(limparStreamAtaIA('{"oQueFoiTratado": "Texto completo."}')).toBe('Texto completo.');
  });
});
