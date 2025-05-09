import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';

import Login from './components/Login';
import Register from './components/Register';
import MealCalendar from './components/MealCalendar';

const isAuthenticated = () => !!localStorage.getItem('token');

function App() {
  return (
    <Router>
      <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Meal Planner</h1>
          <nav>
            {!isAuthenticated() && (
              <>
                <Link to="/login" style={{ marginRight: '1rem' }}>Login</Link>
                <Link to="/register">Register</Link>
              </>
            )}
          </nav>
        </header>

        <main style={{ marginTop: '2rem' }}>
          <Routes>
            <Route path="/" element={isAuthenticated() ? <MealCalendar /> : <Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
