import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-stellar-700">
            Stellar Wave Hub
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'text-stellar-600 font-medium' : 'text-gray-600 hover:text-gray-900'}>
              Directory
            </NavLink>
            {user && (
              <>
                <NavLink to="/submit" className={({ isActive }) => isActive ? 'text-stellar-600 font-medium' : 'text-gray-600 hover:text-gray-900'}>
                  Submit
                </NavLink>
                <NavLink to="/my-submissions" className={({ isActive }) => isActive ? 'text-stellar-600 font-medium' : 'text-gray-600 hover:text-gray-900'}>
                  My Submissions
                </NavLink>
                {user.role === 'admin' && (
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'text-stellar-600 font-medium' : 'text-gray-600 hover:text-gray-900'}>
                    Admin
                  </NavLink>
                )}
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NavLink to="/profile" className="text-sm text-gray-700 hover:text-gray-900 font-medium">
                  {user.display_name}
                </NavLink>
                <button onClick={handleLogout} className="btn-secondary text-sm">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Login</Link>
                <Link to="/register" className="btn-primary text-sm">Register</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
