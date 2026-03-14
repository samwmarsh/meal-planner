import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const BurgerMenu = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label="Open navigation"
        onClick={() => setOpen(!open)}
        className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 rounded-md hover:bg-slate-100 transition-colors"
      >
        <span className="block w-5 h-0.5 bg-slate-600 rounded"></span>
        <span className="block w-5 h-0.5 bg-slate-600 rounded"></span>
        <span className="block w-5 h-0.5 bg-slate-600 rounded"></span>
      </button>
      {open && (
        <div className="absolute top-10 left-0 bg-white rounded-xl shadow-md border border-slate-100 py-2 min-w-40 z-50">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
          >
            Home
          </Link>
          <Link
            to="/shopping-list"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
          >
            Shopping List
          </Link>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
          >
            Profile &amp; Goals
          </Link>
        </div>
      )}
    </div>
  );
};

export default BurgerMenu;
