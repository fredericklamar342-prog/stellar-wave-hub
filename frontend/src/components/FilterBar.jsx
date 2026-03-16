const CATEGORIES = ['defi', 'payments', 'infrastructure', 'tooling', 'nft', 'dao', 'rwa', 'social', 'gaming', 'other'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'most_rated', label: 'Most Rated' },
];

export default function FilterBar({ filters, onChange }) {
  function handle(key, value) {
    onChange({ ...filters, [key]: value, page: 1 });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder="Search projects..."
        value={filters.search || ''}
        onChange={(e) => handle('search', e.target.value)}
        className="input max-w-xs"
      />

      <select
        value={filters.category || ''}
        onChange={(e) => handle('category', e.target.value)}
        className="input w-auto"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
        ))}
      </select>

      <select
        value={filters.sort || 'newest'}
        onChange={(e) => handle('sort', e.target.value)}
        className="input w-auto"
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
