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
import CreateRecipe from './components/CreateRecipe';
import ProgressCharts from './components/ProgressCharts';
import WorkoutLog from './components/WorkoutLog';
import Header from './components/Header';
import AdminQueue from './components/AdminQueue';
import { ToastProvider } from './components/ToastContext';

const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem('token');
    return false;
  }
};

function App() {
  return (
    <ToastProvider>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 dark:text-slate-200 transition-colors overflow-x-hidden">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={isAuthenticated() ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/calendar" element={isAuthenticated() ? <MealCalendar /> : <Navigate to="/login" />} />
          <Route path="/recipes" element={isAuthenticated() ? <RecipeLibrary /> : <Navigate to="/login" />} />
          <Route path="/recipes/create" element={isAuthenticated() ? <CreateRecipe /> : <Navigate to="/login" />} />
          <Route path="/recipes/import" element={isAuthenticated() ? <ImportRecipe /> : <Navigate to="/login" />} />
          <Route path="/recipes/:id" element={isAuthenticated() ? <RecipeDetail /> : <Navigate to="/login" />} />
          <Route path="/shopping-list" element={isAuthenticated() ? <ShoppingList /> : <Navigate to="/login" />} />
          <Route path="/profile" element={isAuthenticated() ? <ProfilePage /> : <Navigate to="/login" />} />
          <Route path="/goals" element={isAuthenticated() ? <GoalsPage /> : <Navigate to="/login" />} />
          <Route path="/log" element={isAuthenticated() ? <DailyLog /> : <Navigate to="/login" />} />
          <Route path="/workouts" element={isAuthenticated() ? <WorkoutLog /> : <Navigate to="/login" />} />
          <Route path="/progress" element={isAuthenticated() ? <ProgressCharts /> : <Navigate to="/login" />} />
          <Route path="/admin" element={isAuthenticated() ? <AdminQueue /> : <Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
