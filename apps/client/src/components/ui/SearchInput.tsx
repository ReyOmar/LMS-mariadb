'use client';

import { Search } from 'lucide-react';
import { isSearchTooShort, MIN_SEARCH_LENGTH } from '@/lib/search';

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Lo que se busca, como placeholder y como nombre accesible: «Buscar curso». */
  label: string;
  /** Busca el servidor, que no filtra con menos de `MIN_SEARCH_LENGTH` caracteres: se avisa. */
  serverSide?: boolean;
  className?: string;
}

export function SearchInput({ value, onChange, label, serverSide = false, className = '' }: Props) {
  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`${label}…`}
          aria-label={label}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
        />
      </div>
      {serverSide && isSearchTooShort(value) && (
        <p className="text-xs text-muted-foreground mt-2">
          Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar.
        </p>
      )}
    </div>
  );
}
