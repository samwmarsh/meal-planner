import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  const token = localStorage.getItem('token');

  return (
    <header>
      <nav>
        {token ? (
          <Link to="/logout">Logout</Link>
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
