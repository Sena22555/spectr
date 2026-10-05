import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, RouterProvider, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import './styles.css';
import { AuthProvider } from './lib/auth';
import { initPlatform } from './lib/platform';
import { AppLayout, Root, SiteLayout } from './components/Layout';
import { Loading } from './components/ui';
import Home from './pages/Home';
import { Login, Register, ResetPassword } from './pages/Auth';
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
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminPeople = lazy(() => import('./pages/admin/People'));
const AdminPerson = lazy(() => import('./pages/admin/Person'));
const PracticeCatalog = lazy(() => import('./pages/practice/Catalog'));
const PracticeTopic = lazy(() => import('./pages/practice/Topic'));
const PracticeDiagnostic = lazy(() => import('./pages/practice/Diagnostic'));
const PracticeTrainers = lazy(() => import('./pages/practice/Trainers'));
const PracticeTrain = lazy(() => import('./pages/practice/Train'));
const PracticeProgress = lazy(() => import('./pages/practice/Progress'));
const PracticeVariant = lazy(() => import('./pages/practice/Variant'));
const Parents = lazy(() => import('./pages/Parents'));
const Tournament = lazy(() => import('./pages/tournament/Tournament'));
const Certificate = lazy(() => import('./pages/tournament/Certificate'));
const Challenge = lazy(() => import('./pages/challenge/Challenge'));
const Family = lazy(() => import('./pages/family/Family'));
const GamesHub = lazy(() => import('./pages/games/Hub'));
const GameNotebook = lazy(() => import('./pages/games/Notebook'));
const GamePlay = lazy(() => import('./pages/games/Play'));

// старые адреса английского ведут в СпектрLingo
function LegacyLesson() {
  const { id = '' } = useParams();
  return <Navigate to={`/games/lingo/play/${id}`} replace />;
}
const Homework = lazy(() => import('./pages/app/Homework'));
const TeachHomework = lazy(() => import('./pages/teach/Homework'));

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

// в демо-версии страницы открываются по #-ссылкам: так работает любой статический хостинг
const router = (__DEMO__ ? createHashRouter : createBrowserRouter)([
  {
    element: <Root />,
    children: [
      // уровень игры — на весь экран, без шапки сайта
      { path: 'games/:game/play/:id', element: s(<GamePlay />) },
      { path: 'english/lesson/:id', element: <LegacyLesson /> },
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
          { path: 'practice', element: s(<PracticeCatalog />) },
          { path: 'practice/check/:subject', element: s(<PracticeDiagnostic />) },
          { path: 'practice/trainers', element: s(<PracticeTrainers />) },
          { path: 'practice/train/:id', element: s(<PracticeTrain />) },
          { path: 'practice/progress', element: s(<PracticeProgress />) },
          { path: 'practice/variant/:key', element: s(<PracticeVariant />) },
          { path: 'parents/:token', element: s(<Parents />) },
          { path: 'tournament', element: s(<Tournament />) },
          { path: 'tournament/certificate/:id', element: s(<Certificate />) },
          { path: 'challenge/:id', element: s(<Challenge />) },
          { path: 'games', element: s(<GamesHub />) },
          { path: 'games/:game', element: s(<GameNotebook />) },
          { path: 'english', element: <Navigate to="/games/lingo" replace /> },
          { path: 'practice/:subject/:topic', element: s(<PracticeTopic />) },
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
          { path: 'reset', element: <ResetPassword /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: 'app',
        element: <AppLayout />,
        children: [
          { index: true, element: s(<Dashboard />) },
          { path: 'schedule', element: s(<Schedule />) },
          { path: 'homework', element: s(<Homework />) },
          { path: 'requests', element: s(<Requests />) },
          { path: 'support', element: s(<Support />) },
          { path: 'support/:id', element: s(<Ticket />) },
          { path: 'profile', element: s(<Profile />) },
        ],
      },
      {
        path: 'family',
        element: <AppLayout roles={['PARENT', 'ADMIN']} />,
        children: [{ index: true, element: s(<Family />) }],
      },
      {
        path: 'teach',
        element: <AppLayout roles={['TEACHER', 'ADMIN']} />,
        children: [
          { index: true, element: s(<TeachToday />) },
          { path: 'lessons', element: s(<TeachLessons />) },
          { path: 'homework', element: s(<TeachHomework />) },
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
          { path: 'analytics', element: s(<AdminAnalytics />) },
          { path: 'people', element: s(<AdminPeople />) },
          { path: 'people/:kind/:id', element: s(<AdminPerson />) },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

// Сайт обновился, пока вкладка была открыта: старые файлы сборки уже удалены — перезагружаемся один раз
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('spectr.reload') ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem('spectr.reload', String(Date.now()));
  } catch {
    /* ignore */
  }
  e.preventDefault();
  window.location.reload();
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
