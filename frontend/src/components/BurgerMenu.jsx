import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const BurgerMenu = () => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label="Open navigation"
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '2rem',
          cursor: 'pointer',
          color: 'var(--accent)',
        }}
      >
        &#9776;
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '2.5rem',
            left: 0,
            background: 'var(--card-bg)',
            boxShadow: 'var(--shadow)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <Link to="/" onClick={() => setOpen(false)}>Home</Link><br />
          <Link to="/profile" onClick={() => setOpen(false)}>Profile</Link><br />
          {/* Add more links as needed */}
        </div>
      )}
    </div>
  );
};

export default BurgerMenu;