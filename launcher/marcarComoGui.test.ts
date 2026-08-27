import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { marcarComoGui, IMAGE_SUBSYSTEM_WINDOWS_GUI } = require('./marcarComoGui.cjs') as typeof import('./marcarComoGui.cjs');

const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

let tmpDir: string;
let exeFalso: string;

/** Monta um PE32+ mínimo (só cabeçalhos, sem seções de verdade) com
 * Subsystem = CUI (console) — o bastante pra `marcarComoGui` achar e trocar
 * o campo certo, sem depender de um `.exe` real no disco. */
function criarPeFalso(subsystem = IMAGE_SUBSYSTEM_WINDOWS_CUI) {
  const dos = Buffer.alloc(0x40);
  const peOffset = 0x40;
  dos.writeUInt32LE(peOffset, 0x3c);

  const peSignature = Buffer.from([0x50, 0x45, 0x00, 0x00]); // "PE\0\0"
  const fileHeader = Buffer.alloc(20);
  const optionalHeader = Buffer.alloc(112); // bem mais que os 70 bytes usados
  optionalHeader.writeUInt16LE(0x20b, 0); // Magic = PE32+
  optionalHeader.writeUInt16LE(subsystem, 68); // Subsystem

  return Buffer.concat([dos, peSignature, fileHeader, optionalHeader]);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-marcarguicomo-'));
  exeFalso = path.join(tmpDir, 'fake.exe');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('marcarComoGui', () => {
  it('troca Subsystem de CUI (3) para GUI (2)', () => {
    fs.writeFileSync(exeFalso, criarPeFalso(IMAGE_SUBSYSTEM_WINDOWS_CUI));
    const resultado = marcarComoGui(exeFalso);
    expect(resultado).toEqual({ alterado: true, subsystemAntes: IMAGE_SUBSYSTEM_WINDOWS_CUI });

    const buf = fs.readFileSync(exeFalso);
    const peOffset = buf.readUInt32LE(0x3c);
    expect(buf.readUInt16LE(peOffset + 4 + 20 + 68)).toBe(IMAGE_SUBSYSTEM_WINDOWS_GUI);
  });

  it('não muda o tamanho do arquivo (garantia crítica: não pode deslocar o payload do pkg)', () => {
    const original = criarPeFalso(IMAGE_SUBSYSTEM_WINDOWS_CUI);
    fs.writeFileSync(exeFalso, original);
    marcarComoGui(exeFalso);
    expect(fs.statSync(exeFalso).size).toBe(original.length);
  });

  it('já GUI: não faz nada, devolve alterado=false', () => {
    fs.writeFileSync(exeFalso, criarPeFalso(IMAGE_SUBSYSTEM_WINDOWS_GUI));
    const resultado = marcarComoGui(exeFalso);
    expect(resultado).toEqual({ alterado: false, subsystemAntes: IMAGE_SUBSYSTEM_WINDOWS_GUI });
  });

  it('arquivo sem assinatura PE válida: lança erro claro', () => {
    fs.writeFileSync(exeFalso, Buffer.alloc(128));
    expect(() => marcarComoGui(exeFalso)).toThrow(/assinatura PE/);
  });
});
