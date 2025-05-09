import React, { useState } from 'react';
import Login from './components/Login';
import MealCalendar from './components/MealCalendar';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Meal Planner</h1>
      {isLoggedIn ? (
        <MealCalendar />
      ) : (
        <Login setIsLoggedIn={setIsLoggedIn} />
      )}
    </div>
  );
}

export default App;
