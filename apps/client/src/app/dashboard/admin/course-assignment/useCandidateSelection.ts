'use client';

import { useCallback, useState } from 'react';
import type { Candidate } from './assignment';
import { allSelected, toggled, toggledVisible, without, type Selection } from './selection';

const NOTHING_SELECTED: Selection<Candidate> = new Map();

export function useCandidateSelection() {
  const [selection, setSelection] = useState(NOTHING_SELECTED);

  const drop = useCallback((guids: readonly string[]) => setSelection((current) => without(current, guids)), []);

  return {
    selected: [...selection.values()],
    count: selection.size,
    has: (guid: string) => selection.has(guid),
    allSelected: (visible: readonly Candidate[]) => allSelected(selection, visible),
    toggle: (candidate: Candidate) => setSelection((current) => toggled(current, candidate)),
    toggleVisible: (visible: readonly Candidate[]) => setSelection((current) => toggledVisible(current, visible)),
    clear: () => setSelection(NOTHING_SELECTED),
    drop,
  };
}

export type CandidateSelection = ReturnType<typeof useCandidateSelection>;
