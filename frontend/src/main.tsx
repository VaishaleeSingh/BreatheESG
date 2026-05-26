import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#fff',
          color: '#2C3E50',
          border: '1px solid #EDE8DF',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(44,62,80,0.10)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '14px',
        },
        success: {
          iconTheme: {
            primary: '#00C4B4',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#E74C3C',
            secondary: '#fff',
          },
        },
      }}
    />
  </React.StrictMode>
);
