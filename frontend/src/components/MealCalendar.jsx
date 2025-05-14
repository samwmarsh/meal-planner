import React, { useState, useEffect } from 'react';
import axios from 'axios';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const MealCalendar = () => {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(null);
  const [meals, setMeals] = useState({}); // { 'YYYY-MM-DD': { Breakfast: '', ... } }
  const [mealOptions, setMealOptions] = useState({
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snacks: [],
  });

  useEffect(() => {
    axios.get('/meals') // Adjust base URL if needed
      .then(res => {
        const grouped = { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
        res.data.forEach(meal => {
          if (grouped[meal.type]) grouped[meal.type].push(meal.name);
        });
        setMealOptions(grouped);
      });
  }, []);

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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>Meal</th>
              {[...Array(daysInMonth)].map((_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mealTypes.map(type => (
              <tr key={type}>
                <td style={{ fontWeight: 'bold' }}>{type}</td>
                {[...Array(daysInMonth)].map((_, i) => {
                  const day = i + 1;
                  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  return (
                    <td key={day} style={{ minWidth: 120, padding: 4 }}>
                      <select
                        value={meals[dateKey]?.[type] || ''}
                        onChange={e => handleMealChange(day, type, e.target.value)}
                      >
                        <option value="">Select</option>
                        {mealOptions[type].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MealCalendar;