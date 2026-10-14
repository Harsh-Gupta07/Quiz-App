import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { StudentPage } from './pages/StudentPage';
import { Brand, Spinner } from './components/ui';

const PresentPage = lazy(() => import('./pages/PresentPage'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminShell = lazy(() => import('./pages/admin/AdminShell'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const QuizEditor = lazy(() => import('./pages/admin/QuizEditor'));
const SessionControl = lazy(() => import('./pages/admin/SessionControl'));
const ResultsPage = lazy(() => import('./pages/admin/ResultsPage'));

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-navy/50">
      <Spinner className="size-8" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <Brand size="lg" />
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <Link to="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<StudentPage />} />
        <Route path="/join/:code" element={<StudentPage />} />
        <Route path="/present/:sessionId" element={<PresentPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Dashboard />} />
          <Route path="quiz/:id" element={<QuizEditor />} />
          <Route path="session/:id" element={<SessionControl />} />
          <Route path="session/:id/results" element={<ResultsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
