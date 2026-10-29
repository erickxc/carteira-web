"""Captura ao vivo da reunião: microfone (faixa `mic` = monitor) e som do
computador (faixa `sistema` = cliente, WASAPI loopback), em pedaços de 30 s,
16 kHz mono, no formato que o transcritor lê (`mic-0001.wav`, `sistema-0001.wav`…).

Duas bibliotecas de propósito: `soundcard` faz o loopback (o som do computador)
sem placa de som virtual, mas recusa microfones cujo formato não é
WAVE_FORMAT_EXTENSIBLE (a webcam Logi C270 da máquina de produção, 28/10/2026);
`sounddevice` (PortAudio) aceita qualquer microfone, mas não faz loopback.

Protocolo com o Node: cria `captura.viva` ao começar e só apaga depois de
gravar o último pedaço (parcial) — o transcritor não encerra enquanto ele
existe. Para quando aparece `PARAR` na pasta. Grava em `.tmp` e renomeia: o
transcritor nunca lê pedaço pela metade. Uma faixa que falha não derruba a
outra; as duas falhando, sai com erro.

Pausa: enquanto existe `PAUSAR` na pasta, o áudio lido vira silêncio antes de
ir para o arquivo (nada é gravado nem transcrito), mas a contagem de tempo
segue, para os horários da transcrição continuarem batendo com o relógio.
"""
import argparse
import os
import sys
import threading
import time
import wave

import numpy as np

SR = 16000
BLOCO = SR // 2  # meio segundo por leitura: checa PARAR com folga


def gravar_pedaco(pasta, faixa, n, amostras):
    nome = f'{faixa}-{n:04d}.wav'
    tmp = os.path.join(pasta, nome + '.tmp')
    pcm = (np.clip(amostras, -1, 1) * 32767).astype('<i2')
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, os.path.join(pasta, nome))


def faixa_loop(pasta, faixa, ler_bloco, pedaco_seg, parar, erros):
    """Lê blocos de meio segundo e solta um WAV a cada `pedaco_seg`."""
    try:
        n, buf, alvo = 1, [], SR * pedaco_seg
        pausar = os.path.join(pasta, 'PAUSAR')
        while True:
            bloco = ler_bloco()
            buf.append(np.zeros_like(bloco) if os.path.exists(pausar) else bloco)
            total = sum(len(b) for b in buf)
            if total >= alvo:
                tudo = np.concatenate(buf)
                gravar_pedaco(pasta, faixa, n, tudo[:alvo])
                buf, n = [tudo[alvo:]], n + 1
            if parar.is_set():
                resto = np.concatenate(buf) if buf else np.zeros(0)
                if len(resto) >= SR:  # menos de 1 s não vale um pedaço
                    gravar_pedaco(pasta, faixa, n, resto)
                return
    except Exception as e:  # noqa: BLE001 — registra e deixa a outra faixa seguir
        erros.append(f'{faixa}: {e!r}')
        print(f'captura {faixa} falhou: {e!r}', file=sys.stderr, flush=True)


def rodar_mic(pasta, pedaco_seg, parar, erros):
    try:
        import sounddevice as sd
        with sd.InputStream(samplerate=SR, channels=1, dtype='float32', blocksize=BLOCO) as s:
            faixa_loop(pasta, 'mic', lambda: s.read(BLOCO)[0][:, 0], pedaco_seg, parar, erros)
    except Exception as e:  # noqa: BLE001
        erros.append(f'mic: {e!r}')
        print(f'captura mic falhou: {e!r}', file=sys.stderr, flush=True)


def rodar_sistema(pasta, pedaco_seg, parar, erros):
    try:
        import soundcard as sc
        alto = sc.default_speaker()
        loop = sc.get_microphone(id=str(alto.name), include_loopback=True)
        with loop.recorder(samplerate=SR, channels=1, blocksize=1024) as r:
            faixa_loop(pasta, 'sistema', lambda: r.record(numframes=BLOCO)[:, 0], pedaco_seg, parar, erros)
    except Exception as e:  # noqa: BLE001
        erros.append(f'sistema: {e!r}')
        print(f'captura sistema falhou: {e!r}', file=sys.stderr, flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pasta', required=True)
    p.add_argument('--pedaco', type=int, default=30)
    a = p.parse_args()

    viva = os.path.join(a.pasta, 'captura.viva')
    open(viva, 'w').close()
    parar, erros = threading.Event(), []
    try:
        faixas = [threading.Thread(target=f, args=(a.pasta, a.pedaco, parar, erros), daemon=True)
                  for f in (rodar_mic, rodar_sistema)]
        for t in faixas:
            t.start()
        while any(t.is_alive() for t in faixas):
            if os.path.exists(os.path.join(a.pasta, 'PARAR')):
                parar.set()
            time.sleep(0.5)
        for t in faixas:
            t.join(timeout=5)
    finally:
        os.remove(viva)
    if len(erros) == 2:
        sys.exit(1)


if __name__ == '__main__':
    main()
