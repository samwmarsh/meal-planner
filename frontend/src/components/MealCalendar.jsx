import React, { useState, useEffect } from 'react';
import axios from 'axios';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

const MealCalendar = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const [meals, setMeals] = useState({});
  const [mealOptions, setMealOptions] = useState({
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snacks: [],
  });
  const [editingDay, setEditingDay] = useState(null);

  useEffect(() => {
    axios.get('/meals').then(res => {
      const grouped = { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
      res.data.forEach(meal => {
        if (grouped[meal.type]) grouped[meal.type].push(meal.name);
      });
      setMealOptions(grouped);
    });
  }, []);

  const handleMealChange = (dateKey, type, value) => {
    setMeals(prev => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        [type]: value,
      },
    }));
  };

  // Build days array with blanks for first week
  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div>
      <h2>
        {today.toLocaleString('default', { month: 'long' })} {year}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          background: '#e2e8f0',
          padding: '8px',
          borderRadius: '8px',
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ fontWeight: 'bold', textAlign: 'center' }}>{d}</div>
        ))}
        {days.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <div
              key={day}
              style={{
                background: '#fff',
                borderRadius: '8px',
                minHeight: '100px',
                padding: '4px',
                position: 'relative',
                boxShadow: 'var(--shadow)',
                cursor: 'pointer',
              }}
              onClick={() => setEditingDay(day)}
            >
              <div style={{ fontWeight: 'bold' }}>{day}</div>
              {mealTypes.map(type =>
                meals[dateKey]?.[type] ? (
                  <div
                    key={type}
                    style={{
                      background: 'var(--accent-light)',
                      color: '#222',
                      borderRadius: '4px',
                      margin: '2px 0',
                      padding: '2px 4px',
                      fontSize: '0.85em',
                    }}
                  >
                    <strong>{type}:</strong> {meals[dateKey][type]}
                  </div>
                ) : null
              )}
              {editingDay === day && (
                <div
                  style={{
                    position: 'absolute',
                    top: 24,
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    zIndex: 10,
                    padding: '8px',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {mealTypes.map(type => (
                    <div key={type} style={{ margin: '4px 0' }}>
                      <label>
                        {type}:{' '}
                        <select
                          value={meals[dateKey]?.[type] || ''}
                          onChange={e => handleMealChange(dateKey, type, e.target.value)}
                        >
                          <option value="">Select</option>
                          {mealOptions[type].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                  <button onClick={() => setEditingDay(null)} style={{ marginTop: 8 }}>Close</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MealCalendar;