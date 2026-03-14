import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';

const tabs = [
  { label: 'Calendar', to: '/' },
  { label: 'Recipes', to: '/recipes' },
  { label: 'Shopping', to: '/shopping-list' },
  { label: 'Goals', to: '/goals' },
  { label: 'Log', to: '/log' },
  { label: 'Profile', to: '/profile' },
];

const Header = () => {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <span className="text-lg font-bold text-blue-600 tracking-tight shrink-0">
          Meal Planner
        </span>

        {/* Tabs — only when authenticated */}
        {token && (
          <nav className="flex-1 overflow-x-auto mx-4">
            <ul className="flex items-center gap-1 min-w-max h-14">
              {tabs.map(({ label, to }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      [
                        'inline-flex items-center px-4 h-14 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                        isActive
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-600 hover:text-blue-600 hover:border-blue-300',
                      ].join(' ')
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Right side */}
        <div className="shrink-0">
          {token ? (
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors cursor-pointer bg-transparent border-none"
            >
              Logout
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <NavLink
                to="/login"
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                Login
              </NavLink>
              <NavLink
                to="/register"
                className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                Register
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
