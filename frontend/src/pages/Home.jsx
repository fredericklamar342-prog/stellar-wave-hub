import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import ProjectCard from '../components/ProjectCard';
import FilterBar from '../components/FilterBar';

const DEFAULT_FILTERS = { search: '', category: '', sort: 'newest', page: 1 };

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.sort) params.sort = filters.sort;
      params.page = filters.page;
      params.limit = 20;

      const { data } = await api.get('/projects', { params });
      setProjects(data.projects);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(fetchProjects, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchProjects, filters.search]);

  useEffect(() => {
    if (!filters.search) fetchProjects();
  }, [filters.category, filters.sort, filters.page]);

  const featured = projects.filter((p) => p.status === 'featured');
  const regular = projects.filter((p) => p.status !== 'featured');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Stellar Wave Projects</h1>
        <p className="text-gray-500 mt-1">Discover projects built through the Stellar Wave Program</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {error && <p className="text-red-600">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-5 h-40 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Featured</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {regular.length > 0 && (
            <section>
              {featured.length > 0 && <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">All Projects</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {regular.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {projects.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg">No projects found.</p>
              <p className="text-sm mt-1">Try adjusting your filters or be the first to submit one.</p>
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="btn-secondary"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-gray-600">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                disabled={filters.page >= pagination.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="btn-secondary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
