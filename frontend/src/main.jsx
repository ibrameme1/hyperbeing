import './instrument.js';
import React from 'react';
import * as Sentry from '@sentry/react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { initPostHog } from './utils/posthog';
import { ErrorFallback } from './components/ErrorBoundary';
import { queryClient } from './api/queryClient';

initPostHog();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error} resetError={resetError} />}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
