import React from 'react';
import '../theme/theme.css';

const ThemeProvider = ({ children }) => {
  // You can expand this to support dark mode or dynamic themes later
  return <>{children}</>;
};

export default ThemeProvider;