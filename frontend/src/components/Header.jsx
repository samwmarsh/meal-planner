import React from 'react';
import { Link, useNavigate } from 'react-router-dom';



const Header = () => {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header>
      <nav>
        {token ? (
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
            Logout
          </button>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
};

export default Header;
