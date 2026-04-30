import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FolderOpen, MessageSquare, Settings, Activity, Layers, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useProjects } from '@/hooks/useProjects';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { isValidUuid } from '@/utils/isValidUuid';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';

export function AppSidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();

  const lastActiveProjectId = useUiStore((s) => s.lastActiveProjectId);
  const setLastActiveProjectId = useUiStore((s) => s.setLastActiveProjectId);

  // Extract project ID from URL when on a project page
  const pathMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const urlProjectId = pathMatch?.[1] && isValidUuid(pathMatch[1]) ? pathMatch[1] : undefined;

  // Use URL project ID when available, otherwise keep the last selected one
  const activeProjectId = urlProjectId ?? lastActiveProjectId ?? undefined;

  // Keep store in sync when URL has a project
  useEffect(() => {
    if (urlProjectId && urlProjectId !== lastActiveProjectId) {
      setLastActiveProjectId(urlProjectId);
    }
  }, [urlProjectId, lastActiveProjectId, setLastActiveProjectId]);

  const { data: projectsData } = useProjects();
  const projects = projectsData?.items ?? [];
  const { data: statusData } = useSystemStatus(activeProjectId);

  const navItems = activeProjectId
    ? [
        { to: '/projects', icon: FolderOpen, label: 'Projects' },
        { to: `/projects/${activeProjectId}/chat`, icon: MessageSquare, label: 'Chat' },
        { to: '/settings', icon: Settings, label: 'Settings' },
        { to: '/status', icon: Activity, label: 'Status' },
      ]
    : [
        { to: '/projects', icon: FolderOpen, label: 'Projects' },
        { to: '/settings', icon: Settings, label: 'Settings' },
        { to: '/status', icon: Activity, label: 'Status' },
      ];

  return (
    <aside className={cn(
      'flex flex-col h-screen bg-sidebar-bg border-r border-sidebar-border transition-all duration-200',
      sidebarCollapsed ? 'w-16' : 'w-60'
    )}>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border shrink-0">
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors mx-auto"
            title="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4 text-primary" />
          </button>
        ) : (
          <>
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-fg-active text-sm tracking-tight">AnswerStack</span>
            <button
              onClick={toggleSidebar}
              className="ml-auto text-sidebar-fg hover:text-sidebar-fg-active transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Project switcher */}
      {!sidebarCollapsed && projects.length > 0 && (
        <div className="px-2 py-2 border-b border-sidebar-border">
          <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isExact = 'exact' in item && item.exact;
          const isActive = isExact
            ? location.pathname === item.to
            : item.to === '/projects'
              ? location.pathname === '/projects'
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                isActive ? 'bg-sidebar-hover text-sidebar-fg-active' : 'text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-active',
                sidebarCollapsed && 'justify-center'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* System status footer */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-sidebar-border">
          <StatusBadge status={statusData?.status || 'ready'} />
        </div>
      )}
    </aside>
  );
}
