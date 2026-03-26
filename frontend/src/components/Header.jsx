import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';

function getTokenPayload() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

const baseTabs = [
  { label: 'Home', to: '/' },
  { label: 'Calendar', to: '/calendar' },
  { label: 'Recipes', to: '/recipes' },
  { label: 'Shopping', to: '/shopping-list' },
  { label: 'Workouts', to: '/workouts' },
  { label: 'Goals', to: '/goals' },
  { label: 'Log', to: '/log' },
  { label: 'Progress', to: '/progress' },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return false; // default to light
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, setDark];
}

function isTokenValid() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch { return false; }
}

const Header = () => {
  const token = isTokenValid() ? localStorage.getItem('token') : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const payload = token ? getTokenPayload() : null;
  const isAdmin = payload?.role === 'admin';
  const tabs = isAdmin ? [...baseTabs, { label: 'Admin', to: '/admin' }] : baseTabs;

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tracking-tight shrink-0">
          Meal Planner
        </span>

        {/* Tabs — desktop only (md+) */}
        {token && (
          <nav className="hidden md:block flex-1 overflow-x-auto mx-4">
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
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                          : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300',
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
        <div className="shrink-0 flex items-center gap-4">
          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer bg-transparent border-none"
            aria-label="Toggle dark mode"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? (
              /* Sun icon */
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
          {token ? (
            <>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `hidden md:inline text-sm font-medium transition-colors ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                  }`
                }
              >
                Profile
              </NavLink>
              <button
                onClick={handleLogout}
                className="hidden md:inline text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer bg-transparent border-none"
              >
                Logout
              </button>
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <NavLink
                to="/login"
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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

      {/* Mobile slide-down menu */}
      {token && mobileMenuOpen && (
        <nav className="md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <ul className="flex flex-col py-2">
            {tabs.map(({ label, to }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    [
                      'block px-6 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                        : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700',
                    ].join(' ')
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
            <li className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
              <NavLink
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  [
                    'block px-6 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700',
                  ].join(' ')
                }
              >
                Profile
              </NavLink>
            </li>
            <li>
              <button
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="w-full text-left px-6 py-2.5 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors bg-transparent border-none cursor-pointer"
              >
                Logout
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
};

export default Header;
