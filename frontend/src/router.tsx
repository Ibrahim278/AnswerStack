import { createBrowserRouter, redirect } from 'react-router';
import { lazy, Suspense } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { PageSkeleton } from './components/common/PageSkeleton';

const ProjectListPage = lazy(() => import('./pages/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, loader: () => redirect('/projects') },
      {
        path: 'projects',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <ProjectListPage />
          </Suspense>
        ),
      },
      {
        path: 'projects/:id',
        element: (
          <Suspense fallback={<PageSkeleton type="detail" />}>
            <ProjectDetailPage />
          </Suspense>
        ),
      },
      {
        path: 'projects/:id/chat',
        element: (
          <Suspense fallback={<PageSkeleton type="chat" />}>
            <ChatPage />
          </Suspense>
        ),
      },
      {
        path: 'projects/:id/chat/:sessionId',
        element: (
          <Suspense fallback={<PageSkeleton type="chat" />}>
            <ChatPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageSkeleton type="form" />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
]);
