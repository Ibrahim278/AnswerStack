import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Box, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';
import { useChat } from '../hooks/useChat';
import { useSessionDetail } from '../hooks/useSessions';
import { useSuggestedPrompts } from '../hooks/useSuggestedPrompts';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { useProject } from '../hooks/useProjects';
import { ChatMessageList } from '../components/chat/ChatMessageList';
import { ChatComposer } from '../components/chat/ChatComposer';
import { ChatEmptyState } from '../components/chat/ChatEmptyState';
import { SourcePanel } from '../components/chat/SourcePanel';
import { MobileSourceDrawer } from '../components/chat/MobileSourceDrawer';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { EmptyState } from '../components/common/EmptyState';

export default function ChatPage() {
  const { id: projectId, sessionId } = useParams<{ id: string; sessionId?: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 48em)');

  // Project info for heading
  const { data: project, isError: projectError, isLoading: projectLoading } = useProject(projectId!);

  // System status for banners (D-81, D-82, D-86)
  const { data: status } = useSystemStatus(projectId);
  const systemStatus = status?.status;

  // Session detail (D-47, D-73)
  const { data: sessionDetail, isError: sessionError } = useSessionDetail(projectId!, sessionId);
  const messages = sessionDetail?.messages ?? [];

  // Suggested prompts (D-50, D-74)
  const { data: suggestedPrompts, isLoading: suggestedPromptsLoading } = useSuggestedPrompts(projectId!);

  // SSE streaming (D-69: URL sync on session creation)
  const handleSessionCreated = useCallback(
    (newSessionId: string) => {
      // D-69: Update URL without polluting history
      void navigate(`/projects/${projectId}/chat/${newSessionId}`, { replace: true });
    },
    [navigate, projectId],
  );

  const { sendMessage, stop, retry, isStreaming } = useChat({
    projectId: projectId!,
    onSessionCreated: handleSessionCreated,
  });

  // Determine if composer should be disabled
  const providerNotConfigured = systemStatus === 'misconfigured';
  const composerDisabled = providerNotConfigured;

  // Handle sending a message
  const handleSend = useCallback(
    (question: string) => {
      void sendMessage({ question, sessionId });
    },
    [sendMessage, sessionId],
  );

  // Handle suggested prompt selection
  const handlePromptSelect = useCallback(
    (prompt: string) => {
      void sendMessage({ question: prompt, sessionId });
    },
    [sendMessage, sessionId],
  );

  // Project not found or invalid ID
  if (!projectLoading && (projectError || (!project && projectId))) {
    return (
      <EmptyState
        icon={<IconAlertCircle size={48} style={{ color: 'var(--mantine-color-red-6)' }} />}
        title="Project not found"
        description="This project does not exist or has been deleted."
        action={{
          label: 'Back to Projects',
          onClick: () => { void navigate('/projects'); },
        }}
      />
    );
  }

  // D-83: Session not found
  if (sessionId && sessionError) {
    return (
      <EmptyState
        icon={<IconAlertCircle size={48} style={{ color: 'var(--mantine-color-red-6)' }} />}
        title="This session no longer exists"
        description="The chat session may have been deleted."
        action={{
          label: 'Start New Chat',
          onClick: () => { void navigate(`/projects/${projectId}/chat`); },
        }}
      />
    );
  }

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <Box
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Main chat area */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'flex 200ms ease-out',
        }}
      >
        {/* Warning banners */}
        {providerNotConfigured && (
          <ErrorBanner
            title="Provider not configured"
            message="Set up your LLM provider to enable chat"
            color="yellow"
            actions={[{
              label: 'Go to Settings',
              onClick: () => { void navigate('/settings'); },
            }]}
          />
        )}
        {systemStatus === 'no_documents' && (
          <ErrorBanner
            title="No documents indexed"
            message="Upload and index documents to get source-grounded answers"
            color="blue"
            actions={[{
              label: 'Go to Project',
              onClick: () => { void navigate(`/projects/${projectId}`); },
            }]}
          />
        )}
        {systemStatus === 'stale' && (
          <Alert
            color="yellow"
            icon={<IconRefresh size={18} />}
            py="xs"
          >
            Index may be out of date -- answers might not reflect recent document changes.{' '}
            <a
              href={`/projects/${projectId}`}
              onClick={(e) => { e.preventDefault(); void navigate(`/projects/${projectId}`); }}
              style={{ color: 'var(--mantine-color-blue-6)' }}
            >
              Rebuild
            </a>
          </Alert>
        )}

        {/* Chat content */}
        {hasMessages ? (
          <ChatMessageList messages={messages} onRetry={retry} />
        ) : (
          <ChatEmptyState
            projectName={project?.name ?? 'your project'}
            suggestedPrompts={suggestedPrompts}
            isSuggestedPromptsLoading={suggestedPromptsLoading}
            onPromptSelect={handlePromptSelect}
          />
        )}

        {/* Composer */}
        <ChatComposer
          onSend={handleSend}
          onStop={stop}
          isStreaming={isStreaming}
          disabled={composerDisabled}
        />
      </Box>

      {/* Source panel -- desktop only (D-01, D-04) */}
      {!isMobile && (
        <SourcePanel messages={messages} />
      )}

      {/* Mobile source drawer (D-03) */}
      {isMobile && (
        <MobileSourceDrawer messages={messages} />
      )}
    </Box>
  );
}
