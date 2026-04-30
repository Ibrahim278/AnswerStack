import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  lastActiveProjectId: string | null;
  setLastActiveProjectId: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      lastActiveProjectId: null,
      setLastActiveProjectId: (id) => set({ lastActiveProjectId: id }),
    }),
    { name: 'answerstack-ui' },
  ),
);
