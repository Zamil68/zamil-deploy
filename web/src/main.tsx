import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { LiveProvider } from './context/LiveContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <ToastProvider>
        <LiveProvider>
          <App />
        </LiveProvider>
      </ToastProvider>
    </AuthProvider>
  </ErrorBoundary>
);
