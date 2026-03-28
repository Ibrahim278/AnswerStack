import { useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/queryClient";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ConnectionOverlay } from "@/components/common/ConnectionOverlay";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { AppLayout } from "@/components/AppLayout";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import ChatPage from "@/pages/ChatPage";
import SettingsPage from "@/pages/SettingsPage";
import StatusPage from "@/pages/StatusPage";
import NotFound from "./pages/NotFound.tsx";

function ConnectionOverlayWrapper() {
  const { showOverlay, refetch } = useSystemStatus();
  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return <ConnectionOverlay visible={showOverlay} onRetry={handleRetry} />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ConnectionOverlayWrapper />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/projects/:id/chat" element={<ChatPage />} />
              <Route path="/projects/:id/chat/:sessionId" element={<ChatPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/status" element={<StatusPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
