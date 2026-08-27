/**
 * Estrutura de pastas da fila (Etapa 3+ do plano de fila/controller), sempre
 * dentro de `DATA_DIR` (OneDrive) — é o transporte entre as 4 máquinas.
 * Ver plano em C:\Users\Kerol\.claude\plans\robust-wandering-sonnet.md,
 * seção "Estrutura de pastas".
 */
const path = require('path');
const { DATA_DIR } = require('../config.cjs');

const FILAS_DIR = path.join(DATA_DIR, 'filas');
const PENDENTES_DIR = path.join(FILAS_DIR, 'pendentes');
const ANEXOS_DIR = path.join(FILAS_DIR, 'anexos');
const RESULTADOS_DIR = path.join(FILAS_DIR, 'resultados');
const PROCESSADAS_DIR = path.join(FILAS_DIR, 'processadas');
const LOG_DIR = path.join(FILAS_DIR, 'log');
const LOCK_FILE = path.join(FILAS_DIR, 'controller.lock');

module.exports = { FILAS_DIR, PENDENTES_DIR, ANEXOS_DIR, RESULTADOS_DIR, PROCESSADAS_DIR, LOG_DIR, LOCK_FILE };
