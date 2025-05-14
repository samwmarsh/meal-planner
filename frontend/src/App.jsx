import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './components/Login';
import Register from './components/Register';
import MealCalendar from './components/MealCalendar';
import Header from './components/Header'; // <-- import your Header

const isAuthenticated = () => !!localStorage.getItem('token');

function App() {
  return (
    <Router>
      <Header /> {/* <-- use your Header here */}
      <main style={{ marginTop: '2rem', padding: '1rem', fontFamily: 'sans-serif' }}>
        <Routes>
          <Route path="/" element={isAuthenticated() ? <MealCalendar /> : <Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;