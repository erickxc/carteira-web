"""Transcritor da reunião (monitorIA) — processo vivo enquanto a sessão durar.

Lê os pedaços WAV que a fonte solta na pasta da sessão (`mic-0001.wav`,
`sistema-0001.wav`…, 30 s, 16 kHz mono) e anexa um segmento por linha em
`transcricao.jsonl`. Comunicação com o Node só por arquivos: `transcritor.pronto`
(modelo carregado), `PARAR` (pedido do Node), `transcritor.fim` (terminou).
Com captura ao vivo, `captura.viva` existe até o último pedaço ser gravado:
o transcritor só termina depois que ele some, para não perder o fim da reunião.

Lê o WAV com `wave` + numpy de propósito: o `decode_audio` do faster-whisper
quebra com PyAV 19 (`open() got an unexpected keyword argument 'metadata_errors'`).
"""
import argparse, json, os, re, time, wave

import numpy as np
from faster_whisper import WhisperModel

PEDACO_SEG = 30
NOME = re.compile(r'^(mic|sistema)-(\d{4})\.wav$')


def ler_wav(caminho):
    with wave.open(caminho) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def pendentes(pasta, feitos):
    achados = []
    for nome in os.listdir(pasta):
        m = NOME.match(nome)
        if m and nome not in feitos:
            achados.append((int(m.group(2)), m.group(1), nome))
    return sorted(achados)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pasta', required=True)
    p.add_argument('--vocab', default=None)
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--modelo', default='large-v3-turbo')
    a = p.parse_args()

    vocab = None
    if a.vocab and os.path.exists(a.vocab):
        vocab = open(a.vocab, encoding='utf-8').read().strip() or None

    modelo = WhisperModel(a.modelo, device='cpu', compute_type='int8', cpu_threads=a.threads)
    open(os.path.join(a.pasta, 'transcritor.pronto'), 'w').close()

    saida = open(os.path.join(a.pasta, 'transcricao.jsonl'), 'a', encoding='utf-8')
    feitos = set()
    while True:
        fila = pendentes(a.pasta, feitos)
        if not fila:
            if os.path.exists(os.path.join(a.pasta, 'PARAR')) and not os.path.exists(os.path.join(a.pasta, 'captura.viva')):
                break
            time.sleep(1)
            continue
        pedaco, faixa, nome = fila[0]
        segs, _ = modelo.transcribe(
            ler_wav(os.path.join(a.pasta, nome)), language='pt', vad_filter=True, beam_size=1,
            # Vocabulário só como initial_prompt: com hotwords também, o prompt ia duas vezes
            # e um vocabulário grande estourava as 448 posições do Whisper (RuntimeError).
            initial_prompt=vocab,
        )
        base = (pedaco - 1) * PEDACO_SEG
        for s in segs:
            texto = s.text.strip()
            if texto:
                saida.write(json.dumps({'faixa': faixa, 'pedaco': pedaco, 'inicio': round(base + s.start, 1),
                                        'fim': round(base + s.end, 1), 'texto': texto}, ensure_ascii=False) + '\n')
        saida.flush()
        feitos.add(nome)

    saida.close()
    open(os.path.join(a.pasta, 'transcritor.fim'), 'w').close()


if __name__ == '__main__':
    main()
