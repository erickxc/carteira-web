import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { gerarHtml } = require('./telaCarregando.cjs');

describe('gerarHtml', () => {
  it('embute a porta certa na URL de status e na URL do app', () => {
    const html = gerarHtml(3097);
    expect(html).toContain('const PORTA = 3097;');
    expect(html).toContain('"http://127.0.0.1:" + PORTA + "/api/status/base"');
    expect(html).toContain('"http://127.0.0.1:" + PORTA + "/"');
  });

  it('é um documento HTML autocontido (sem <script src> nem <link> externos)', () => {
    const html = gerarHtml(3001);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
  });
});
