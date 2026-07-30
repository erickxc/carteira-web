import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChecklistItem } from '../../types';

/** Estado da checklist/pauta da reunião + etiquetas rápidas. */
export function useChecklist(initial: ChecklistItem[] = []) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initial);
  const [novoItem, setNovoItem] = useState('');

  function addItem() {
    const t = novoItem.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, { id: uuidv4(), text: t, done: false }]);
    setNovoItem('');
  }
  const toggleItem = (id: string) => setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const removeItem = (id: string) => setChecklist((prev) => prev.filter((i) => i.id !== id));
  // Etiquetas rápidas da pauta: clicar adiciona um item de checklist com a tag
  // (usa o texto digitado, se houver: "#Alvo comprar X").
  function addEtiqueta(tag: string) {
    const txt = novoItem.trim() ? `${tag} ${novoItem.trim()}` : tag;
    setChecklist((prev) => [...prev, { id: uuidv4(), text: txt, done: false }]);
    setNovoItem('');
  }

  return { checklist, setChecklist, novoItem, setNovoItem, addItem, toggleItem, removeItem, addEtiqueta };
}
