import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import './styles.css';
import { AuthProvider } from './lib/auth';
import { initPlatform } from './lib/platform';
import { AppLayout, Root, SiteLayout } from './components/Layout';
import { Loading } from './components/ui';
import Home from './pages/Home';
import { Login, Register } from './pages/Auth';
import NotFound from './pages/NotFound';

const Teachers = lazy(() => import('./pages/Teachers'));
const Teacher = lazy(() => import('./pages/Teacher'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Subject = lazy(() => import('./pages/Subject'));
const Groups = lazy(() => import('./pages/Groups'));
const Group = lazy(() => import('./pages/Group'));
const Book = lazy(() => import('./pages/Book'));

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Schedule = lazy(() => import('./pages/app/Schedule'));
const Requests = lazy(() => import('./pages/app/Requests'));
const Support = lazy(() => import('./pages/app/Support'));
const Ticket = lazy(() => import('./pages/app/Ticket'));
const Profile = lazy(() => import('./pages/app/Profile'));

const TeachToday = lazy(() => import('./pages/teach/Today'));
const TeachLessons = lazy(() => import('./pages/teach/Lessons'));
const TeachStudents = lazy(() => import('./pages/teach/Students'));
const TeachRequests = lazy(() => import('./pages/teach/Requests'));
const TeachGroups = lazy(() => import('./pages/teach/Groups'));

const AdminHome = lazy(() => import('./pages/admin/Overview'));
const AdminBookings = lazy(() => import('./pages/admin/Bookings'));
const AdminLessons = lazy(() => import('./pages/admin/Lessons'));
const AdminGroups = lazy(() => import('./pages/admin/Groups'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminTeachers = lazy(() => import('./pages/admin/Teachers'));
const AdminSubjects = lazy(() => import('./pages/admin/Subjects'));
const AdminRequests = lazy(() => import('./pages/admin/Requests'));
const AdminTickets = lazy(() => import('./pages/admin/Tickets'));

const s = (el: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="mx-auto max-w-5xl p-6">
        <Loading />
      </div>
    }
  >
    {el}
  </Suspense>
);

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <SiteLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'teachers', element: s(<Teachers />) },
          { path: 'teachers/:slug', element: s(<Teacher />) },
          { path: 'subjects', element: s(<Subjects />) },
          { path: 'subjects/:slug', element: s(<Subject />) },
          { path: 'groups', element: s(<Groups />) },
          { path: 'groups/:slug', element: s(<Group />) },
          { path: 'book', element: s(<Book />) },
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: 'app',
        element: <AppLayout />,
        children: [
          { index: true, element: s(<Dashboard />) },
          { path: 'schedule', element: s(<Schedule />) },
          { path: 'requests', element: s(<Requests />) },
          { path: 'support', element: s(<Support />) },
          { path: 'support/:id', element: s(<Ticket />) },
          { path: 'profile', element: s(<Profile />) },
        ],
      },
      {
        path: 'teach',
        element: <AppLayout roles={['TEACHER', 'ADMIN']} />,
        children: [
          { index: true, element: s(<TeachToday />) },
          { path: 'lessons', element: s(<TeachLessons />) },
          { path: 'students', element: s(<TeachStudents />) },
          { path: 'requests', element: s(<TeachRequests />) },
          { path: 'groups', element: s(<TeachGroups />) },
        ],
      },
      {
        path: 'admin',
        element: <AppLayout roles={['ADMIN']} />,
        children: [
          { index: true, element: s(<AdminHome />) },
          { path: 'bookings', element: s(<AdminBookings />) },
          { path: 'lessons', element: s(<AdminLessons />) },
          { path: 'groups', element: s(<AdminGroups />) },
          { path: 'users', element: s(<AdminUsers />) },
          { path: 'teachers', element: s(<AdminTeachers />) },
          { path: 'subjects', element: s(<AdminSubjects />) },
          { path: 'requests', element: s(<AdminRequests />) },
          { path: 'tickets', element: s(<AdminTickets />) },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

initPlatform().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </MotionConfig>
    </StrictMode>,
  );
});
