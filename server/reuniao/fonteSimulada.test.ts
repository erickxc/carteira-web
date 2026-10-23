import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { iniciarFonteSimulada } from './fonteSimulada.cjs';

const temFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('fonte simulada', () => {
  it.skipIf(!temFfmpeg)('solta pedaços de 30 s numerados, sem .tmp no fim', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fonte-'));
    const arquivo = path.join(pasta, 'origem.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=65', arquivo]);
    const fonte = iniciarFonteSimulada({ arquivo, pasta, velocidade: 30 });
    await fonte.concluida;
    const wavs = fs.readdirSync(pasta).filter((f) => f.startsWith('sistema-')).sort();
    expect(wavs).toEqual(['sistema-0001.wav', 'sistema-0002.wav', 'sistema-0003.wav']);
    expect(fs.readdirSync(pasta).some((f) => f.endsWith('.tmp'))).toBe(false);
  }, 30000);

  it.skipIf(!temFfmpeg)('parar interrompe antes do fim', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fonte-'));
    const arquivo = path.join(pasta, 'origem.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=300', arquivo]);
    const fonte = iniciarFonteSimulada({ arquivo, pasta, velocidade: 30 });
    setTimeout(() => fonte.parar(), 1500);
    await fonte.concluida;
    expect(fs.readdirSync(pasta).filter((f) => f.startsWith('sistema-')).length).toBeLessThan(10);
  }, 30000);
});
