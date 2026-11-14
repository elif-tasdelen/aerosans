import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { RISK_COLORS } from './config.js';
import './styles.css';

// One source for risk colors: the badge CSS reads these variables, the 3D sheath uses RISK_COLORS.
const rootStyle = document.documentElement.style;
rootStyle.setProperty('--green', RISK_COLORS.normal);
rootStyle.setProperty('--yellow', RISK_COLORS.borderline);
rootStyle.setProperty('--red', RISK_COLORS.high);
rootStyle.setProperty('--neutral', RISK_COLORS.neutral);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
