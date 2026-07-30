const { z } = require('zod');

// ---------------------------------------------------------------------------
// Validação de entrada (zod)
// Schemas por entidade checam SÓ os campos realmente obrigatórios + tipo; todo
// o resto passa direto (.passthrough()) para não descartar colunas legadas nem
// os campos que o próprio servidor deriva/injeta.
// - status/type/tipo/segmento NÃO são validados contra listas fixas: são
//   editáveis pelo usuário no CRUD de Categorias, então travar num enum
//   quebraria o app quando ele cadastrar um valor novo.
// - Campos aninhados (servicos/checklist/preAnalise/attachments) chegam como
//   string JSON serializada (ver src/api/client.ts), por isso não são validados
//   como array aqui.
// ---------------------------------------------------------------------------
const textoObrigatorio = (nome) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string({ error: `${nome} é obrigatório.` }).min(1, `${nome} é obrigatório.`)
  );

const clienteCreateSchema = z.object({ empresa: textoObrigatorio('empresa') }).passthrough();
const clienteUpdateSchema = z.object({ empresa: textoObrigatorio('empresa').optional() }).passthrough();
const clienteBulkItemSchema = clienteCreateSchema.extend({ id: textoObrigatorio('id') });

// subject NÃO é obrigatório: Contato/Relatório são eventos sem assunto. A
// exigência de assunto para reunião vive no frontend (decisão de UX), não aqui.
const agendaCreateSchema = z.object({
  clientId: textoObrigatorio('clientId'),
  date: textoObrigatorio('date'),
  type: textoObrigatorio('type'),
}).passthrough();
const agendaUpdateSchema = z.object({
  clientId: textoObrigatorio('clientId').optional(),
  date: textoObrigatorio('date').optional(),
  type: textoObrigatorio('type').optional(),
}).passthrough();
const agendaBulkItemSchema = agendaCreateSchema.extend({ id: textoObrigatorio('id') });

const lembreteCreateSchema = z.object({
  title: textoObrigatorio('title'),
  datetime: textoObrigatorio('datetime'),
}).passthrough();
const lembreteUpdateSchema = z.object({
  title: textoObrigatorio('title').optional(),
  datetime: textoObrigatorio('datetime').optional(),
}).passthrough();

const acaoCreateSchema = z.object({
  clientId: textoObrigatorio('clientId'),
  tipo: textoObrigatorio('tipo'),
  segmento: textoObrigatorio('segmento'),
  status: textoObrigatorio('status'),
}).passthrough();
const acaoUpdateSchema = z.object({
  clientId: textoObrigatorio('clientId').optional(),
  tipo: textoObrigatorio('tipo').optional(),
  segmento: textoObrigatorio('segmento').optional(),
  status: textoObrigatorio('status').optional(),
}).passthrough();

const modeloCreateSchema = z.object({
  segmento: textoObrigatorio('segmento'),
  titulo: textoObrigatorio('titulo'),
  conteudo: textoObrigatorio('conteudo'),
}).passthrough();
const modeloUpdateSchema = z.object({
  segmento: textoObrigatorio('segmento').optional(),
  titulo: textoObrigatorio('titulo').optional(),
  conteudo: textoObrigatorio('conteudo').optional(),
}).passthrough();

const categoriaUpdateSchema = z.object({
  tipo: textoObrigatorio('tipo').optional(),
  valor: textoObrigatorio('valor').optional(),
}).passthrough();

// Middleware: valida req.body contra um schema; 400 com mensagem clara se falhar.
function validar(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(400).json({ error: r.error.issues.map((i) => i.message).join('; ') });
    }
    req.body = r.data;
    next();
  };
}

// Idem para endpoints em lote: exige que o corpo seja um array (sem isto,
// req.body.map lançava 500 quando o cliente mandava algo que não é lista) e
// valida cada item contra o schema.
function validarLote(schemaItem) {
  return (req, res, next) => {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Corpo da requisição deve ser uma lista.' });
    }
    const validos = [];
    for (let i = 0; i < req.body.length; i++) {
      const r = schemaItem.safeParse(req.body[i]);
      if (!r.success) {
        return res.status(400).json({ error: `Item ${i + 1}: ${r.error.issues.map((x) => x.message).join('; ')}` });
      }
      validos.push(r.data);
    }
    req.body = validos;
    next();
  };
}

module.exports = {
  validar, validarLote,
  clienteCreateSchema, clienteUpdateSchema, clienteBulkItemSchema,
  agendaCreateSchema, agendaUpdateSchema, agendaBulkItemSchema,
  lembreteCreateSchema, lembreteUpdateSchema,
  acaoCreateSchema, acaoUpdateSchema,
  modeloCreateSchema, modeloUpdateSchema,
  categoriaUpdateSchema,
};
