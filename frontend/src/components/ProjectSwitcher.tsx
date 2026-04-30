import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FolderOpen, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectResponse } from '@/types';

interface ProjectSwitcherProps {
  projects: ProjectResponse[];
  activeProjectId?: string;
}

export function ProjectSwitcher({ projects, activeProjectId }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-all',
          'bg-sidebar-hover/60 border border-sidebar-border',
          'hover:bg-sidebar-hover hover:border-sidebar-fg/20',
          open && 'bg-sidebar-hover border-sidebar-fg/20',
        )}
      >
        <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-sidebar-fg-active truncate">
          {activeProject?.name ?? 'Select project'}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-sidebar-fg/60 shrink-0 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-sidebar-border bg-sidebar-bg shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              return (
                <button
                  key={project.id}
                  onClick={() => {
                    navigate(`/projects/${project.id}/chat`);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors',
                    isActive
                      ? 'text-sidebar-fg-active bg-sidebar-hover'
                      : 'text-sidebar-fg hover:text-sidebar-fg-active hover:bg-sidebar-hover',
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{project.name}</span>
                  {isActive && <Check className="w-3 h-3 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
