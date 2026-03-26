import { useEffect } from 'react';
import { AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet, useLocation } from 'react-router';
import { useIsFetching } from '@tanstack/react-query';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import '../../global.css';

import { useUiStore } from '../../stores/uiStore';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileDrawer } from './MobileDrawer';
import { SkipToMain } from '../common/SkipToMain';
import { ConnectionOverlay } from '../common/ConnectionOverlay';
import { ErrorBoundary } from '../common/ErrorBoundary';

NProgress.configure({ showSpinner: false, minimum: 0.1, speed: 300 });

export function AppLayout() {
  const location = useLocation();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1];
  const { showOverlay, refetch } = useSystemStatus(activeProjectId, { notifyTransitions: true });
  const isFetching = useIsFetching();

  // NProgress integration - track TanStack Query fetching state
  useEffect(() => {
    if (isFetching > 0) {
      if (!NProgress.isStarted()) {
        NProgress.start();
      }
    } else {
      NProgress.done();
    }
  }, [isFetching]);

  // Focus management: move focus to h1 after route change (D-27)
  useEffect(() => {
    if (!/jsdom/i.test(window.navigator.userAgent)) {
      window.scrollTo({ top: 0, left: 0 });
    }
    // Small delay to ensure the page component has rendered its h1
    const timer = setTimeout(() => {
      const heading = document.querySelector('main h1') as HTMLElement | null;
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }, 100);

    return () => { clearTimeout(timer); };
  }, [location.pathname]);

  return (
    <>
      <SkipToMain />
      <AppShell
        className="app-shell"
        padding="md"
        header={{ height: 72 }}
        navbar={{
          width: sidebarCollapsed ? 60 : 280,
          breakpoint: 'sm',
          collapsed: { mobile: true },
        }}
      >
        <AppShell.Header>
          <Header onMobileMenuToggle={toggleMobile} mobileMenuOpened={mobileOpened} />
        </AppShell.Header>

        <AppShell.Navbar>
          <Sidebar />
        </AppShell.Navbar>

        <AppShell.Main id="main-content" className="app-main">
          <ErrorBoundary>
            <div className="page-shell">
              <Outlet />
            </div>
          </ErrorBoundary>
        </AppShell.Main>
      </AppShell>

      <MobileDrawer opened={mobileOpened} onClose={closeMobile} />
      <ConnectionOverlay visible={showOverlay} onRetry={() => { void refetch(); }} />
    </>
  );
}
