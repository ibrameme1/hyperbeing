import { Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PresentationPage from './pages/PresentationPage';
import PromptGeneratorPage from './pages/PromptGeneratorPage';
import DesignGalleryPage from './pages/DesignGalleryPage';
import Onboarding from './pages/Onboarding';
import AuthCallback from './pages/AuthCallback';
import Pricing from './pages/Pricing';
import BillingSuccess from './pages/BillingSuccess';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Homepage from './pages/Homepage';
import ServicePage from './pages/ServicePage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import Profile from './pages/Profile';
import CookieConsent from './components/CookieConsent';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function wrap(element) {
  return <ErrorBoundary>{element}</ErrorBoundary>;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <Routes>
        <Route path="/" element={wrap(<Homepage />)} />
        <Route path="/login" element={<PublicRoute>{wrap(<Login />)}</PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute>{wrap(<Dashboard />)}</ProtectedRoute>} />
        <Route path="/presentations/:id" element={<ProtectedRoute>{wrap(<PresentationPage />)}</ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute>{wrap(<Onboarding />)}</ProtectedRoute>} />
        <Route path="/prompt-generator" element={<ProtectedRoute>{wrap(<PromptGeneratorPage />)}</ProtectedRoute>} />
        <Route path="/design" element={<ProtectedRoute>{wrap(<DesignGalleryPage />)}</ProtectedRoute>} />
        <Route path="/auth/callback" element={wrap(<AuthCallback />)} />
        <Route path="/pricing" element={wrap(<Pricing />)} />
        <Route path="/services/:slug" element={wrap(<ServicePage />)} />
        <Route path="/billing/success" element={<ProtectedRoute>{wrap(<BillingSuccess />)}</ProtectedRoute>} />
        <Route path="/terms" element={wrap(<Terms />)} />
        <Route path="/privacy" element={wrap(<Privacy />)} />
        <Route path="/analytics" element={<ProtectedRoute>{wrap(<AnalyticsDashboard />)}</ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute>{wrap(<Profile />)}</ProtectedRoute>} />
      </Routes>
      <CookieConsent />
      <Analytics />
      <SpeedInsights />
    </AuthProvider>
    </ThemeProvider>
  );
}
