import { Link } from 'react-router-dom';

const CATEGORY_COLORS = {
  defi: 'bg-purple-100 text-purple-700',
  payments: 'bg-green-100 text-green-700',
  infrastructure: 'bg-blue-100 text-blue-700',
  tooling: 'bg-yellow-100 text-yellow-700',
  nft: 'bg-pink-100 text-pink-700',
  dao: 'bg-indigo-100 text-indigo-700',
  social: 'bg-orange-100 text-orange-700',
  gaming: 'bg-red-100 text-red-700',
  rwa: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-700',
};

function StarRating({ value }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-yellow-400">★</span>
      <span className="text-sm font-medium">{value > 0 ? value.toFixed(1) : '—'}</span>
    </span>
  );
}

export default function ProjectCard({ project }) {
  return (
    <Link to={`/projects/${project.slug}`} className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-stellar-600 truncate">{project.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{project.description}</p>
        </div>
        {project.status === 'featured' && (
          <span className="badge bg-stellar-100 text-stellar-700 shrink-0">Featured</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`badge ${CATEGORY_COLORS[project.category] || CATEGORY_COLORS.other}`}>
          {project.category}
        </span>
        {project.tags?.slice(0, 3).map((tag) => (
          <span key={tag} className="badge bg-gray-100 text-gray-600">{tag}</span>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500 mt-auto pt-2 border-t border-gray-100">
        <StarRating value={project.avg_rating} />
        <span>{project.rating_count} {project.rating_count === 1 ? 'rating' : 'ratings'}</span>
      </div>
    </Link>
  );
}
