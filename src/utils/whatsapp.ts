// Monta o link de conversa direta no WhatsApp a partir de um telefone digitado
// em qualquer formato ("(21) 99999-9999", "21 99999 9999", etc.). Assume Brasil
// (DDI 55) quando o número não já vem com o código do país.
export function linkWhatsApp(telefone: string): string {
  const digits = (telefone || '').replace(/\D/g, '');
  if (digits.length < 10) return ''; // sem DDD+número suficiente — não gera link
  const comDDI = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${comDDI}`;
}
