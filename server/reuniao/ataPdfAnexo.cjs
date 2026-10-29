// PDF da ata anexado ao evento (marcado `ataPdf: true`): gerado ao fim da
// reunião e refeito quando a ata é editada e salva (`dominio/agenda.cjs`).
// Sempre UM só: o anterior sai da lista e o arquivo é apagado.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');

const temAtaPdf = (evento) => listaJSON(evento?.attachments).some((a) => a?.ataPdf);

/**
 * `evento` = linha de Agenda já com a ata e os anexos atuais (quem chama passa
 * o estado novo: em máquina cliente a leitura do repo ainda pode estar velha).
 * `gravar(patch)` grava no evento. Devolve a lista de anexos gravada.
 */
function anexarAtaPdf({ repo, evento, gravar, uploadsDir }) {
  uploadsDir ??= require('../config.cjs').UPLOADS_DIR;
  const { eventoParaAta } = require('../ia/tools.cjs');
  const { gerarAtaPdfBuffer } = require('../ia/ataPdf.cjs');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento.clientId));
  const ctx = cliente ? { cliente: { ...cliente, contatos: listaJSON(cliente.contatos) } } : {};
  const { buffer, nomeArquivo } = gerarAtaPdfBuffer(eventoParaAta(evento), ctx);

  const filename = `${crypto.randomUUID()}-${nomeArquivo}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  const atuais = listaJSON(evento.attachments);
  for (const a of atuais.filter((x) => x?.ataPdf)) {
    fs.rmSync(path.join(uploadsDir, path.basename(String(a.filename))), { force: true });
  }
  const attachments = [
    ...atuais.filter((x) => !x?.ataPdf),
    { id: filename, filename, originalName: nomeArquivo, uploadedAt: new Date().toISOString(), ataPdf: true },
  ];
  gravar({ attachments });
  return attachments;
}

module.exports = { anexarAtaPdf, temAtaPdf };
