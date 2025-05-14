import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BurgerMenu from './BurgerMenu';

const Header = () => {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <BurgerMenu />
        <span style={{ marginLeft: '1rem', fontWeight: 'bold', color: 'var(--accent)' }}>Meal Planner</span>
      </div>
      <nav>
        {token ? (
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
            Logout
          </button>
        ) : (
          <>
            <Link to="/login" style={{ marginRight: '1rem' }}>Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
};

export default Header;