import React, { useState } from 'react';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const mealOptions = {
  Breakfast: ['Oatmeal', 'Eggs', 'Smoothie'],
  Lunch: ['Salad', 'Sandwich', 'Soup'],
  Dinner: ['Chicken', 'Pasta', 'Fish'],
  Snacks: ['Fruit', 'Yogurt', 'Nuts'],
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const MealCalendar = () => {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(null);
  const [meals, setMeals] = useState({}); // { 'YYYY-MM-DD': { Breakfast: '', ... } }

  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = getDaysInMonth(year, month);

  const handleMealChange = (day, type, value) => {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setMeals((prev) => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        [type]: value,
      },
    }));
  };

  return (
    <div>
      <h2>
        {today.toLocaleString('default', { month: 'long' })} {year}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {[...Array(daysInMonth)].map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <div
              key={day}
              style={{
                border: '1px solid #eee',
                borderRadius: 8,
                padding: 8,
                background: selectedDay === day ? 'var(--accent-light)' : 'var(--card-bg)',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedDay(day)}
            >
              <div style={{ fontWeight: 'bold' }}>{day}</div>
              {selectedDay === day && (
                <div>
                  {mealTypes.map((type) => (
                    <div key={type} style={{ margin: '4px 0' }}>
                      <label>
                        {type}:{' '}
                        <select
                          value={meals[dateKey]?.[type] || ''}
                          onChange={(e) => handleMealChange(day, type, e.target.value)}
                        >
                          <option value="">Select</option>
                          {mealOptions[type].map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
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