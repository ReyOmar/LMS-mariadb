import { ChevronDown } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';

interface Props<F extends string> {
  search: string;
  onSearch: (search: string) => void;
  searchLabel: string;
  filter: F;
  onFilter: (filter: F) => void;
  filterLabel: string;
  options: readonly { value: F; label: string }[];
}

/** Buscador del servidor y desplegable de filtro que van sobre las listas del examinador. */
export function SearchAndFilter<F extends string>({
  search,
  onSearch,
  searchLabel,
  filter,
  onFilter,
  filterLabel,
  options,
}: Props<F>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
      <SearchInput value={search} onChange={onSearch} label={searchLabel} serverSide className="flex-1 max-w-lg" />
      <div className="relative w-full sm:w-72">
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value as F)}
          aria-label={filterLabel}
          className="w-full bg-card border border-border/50 rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm font-medium appearance-none truncate"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
