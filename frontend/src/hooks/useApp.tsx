import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Project, SystemStatus } from '@/types/api';

interface AppState {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  systemStatus: SystemStatus | null;
  setSystemStatus: (status: SystemStatus) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(c => !c), []);

  return (
    <AppContext.Provider value={{ activeProject, setActiveProject, systemStatus, setSystemStatus, sidebarCollapsed, toggleSidebar }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
