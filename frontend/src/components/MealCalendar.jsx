import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import axios from 'axios';

const MealCalendar = () => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchMeals = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/meals`);
        const formatted = res.data.map((meal) => ({
          title: `${meal.type}: ${meal.name}`,
          date: meal.date, // ensure this is 'YYYY-MM-DD'
        }));
        setEvents(formatted);
      } catch (err) {
        console.error('Error fetching meals', err);
      }
    };

    fetchMeals();
  }, []);

  return (
    <FullCalendar
      plugins={[dayGridPlugin]}
      initialView="dayGridMonth"
      events={events}
      height="auto"
    />
  );
};

export default MealCalendar;

