import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import MealCalendar from './components/MealCalendar';
import ShoppingList from './components/ShoppingList';
import ProfilePage from './components/ProfilePage';
import GoalsPage from './components/GoalsPage';
import DailyLog from './components/DailyLog';
import RecipeLibrary from './components/RecipeLibrary';
import RecipeDetail from './components/RecipeDetail';
import ImportRecipe from './components/ImportRecipe';
import Header from './components/Header';

const isAuthenticated = () => !!localStorage.getItem('token');

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={isAuthenticated() ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/recipes" element={isAuthenticated() ? <RecipeLibrary /> : <Navigate to="/login" />} />
          <Route path="/recipes/import" element={isAuthenticated() ? <ImportRecipe /> : <Navigate to="/login" />} />
          <Route path="/recipes/:id" element={isAuthenticated() ? <RecipeDetail /> : <Navigate to="/login" />} />
          <Route path="/shopping-list" element={isAuthenticated() ? <ShoppingList /> : <Navigate to="/login" />} />
          <Route path="/profile" element={isAuthenticated() ? <ProfilePage /> : <Navigate to="/login" />} />
          <Route path="/goals" element={isAuthenticated() ? <GoalsPage /> : <Navigate to="/login" />} />
          <Route path="/log" element={isAuthenticated() ? <DailyLog /> : <Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
