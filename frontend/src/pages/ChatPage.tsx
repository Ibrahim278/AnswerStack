import { useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Box, Alert, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconRefresh,
  IconSparkles,
  IconBooks,
} from '@tabler/icons-react';
import { useChat } from '../hooks/useChat';
import { useSessionDetail } from '../hooks/useSessions';
import { useSuggestedPrompts } from '../hooks/useSuggestedPrompts';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { useProject } from '../hooks/useProjects';
import { useChatStore } from '../stores/chatStore';
import { parseSources } from '../utils/chatSources';
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

  // Project info for heading -- gate other queries on project success
  const { data: project, isError: projectError, isLoading: projectLoading } = useProject(projectId!);
  const projectValid = !!project && !projectError;

  // System status for banners (D-81, D-82, D-86) -- only fetch when project exists
  const { data: status } = useSystemStatus(projectValid ? projectId : undefined);
  const systemStatus = status?.status;

  // Session detail (D-47, D-73) -- only fetch when project exists
  const { data: sessionDetail, isError: sessionError } = useSessionDetail(
    projectValid ? projectId! : '', sessionId,
  );
  const messages = sessionDetail?.messages ?? [];

  // Suggested prompts (D-50, D-74) -- only fetch when project exists
  const { data: suggestedPrompts, isLoading: suggestedPromptsLoading } = useSuggestedPrompts(
    projectValid ? projectId! : '',
  );

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
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);
  const activeSourceMsgId = useChatStore((s) => s.activeSourceMsgId);
  const sourcePanelOpen = useChatStore((s) => s.sourcePanelOpen);
  const currentSources = useChatStore((s) => s.currentSources);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

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
  const latestSourceTarget = useMemo(() => {
    if (currentSources.length > 0 && streamingMessageId) {
      return { messageId: streamingMessageId, count: currentSources.length };
    }

    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const message = messages[idx];
      if (message.role !== 'assistant') continue;

      const count = parseSources(message.sources_json).length;
      if (count > 0) {
        return { messageId: message.id, count };
      }
    }

    return null;
  }, [currentSources, messages, streamingMessageId]);
  const sourceSummaryLabel = latestSourceTarget
    ? `${latestSourceTarget.count} ${latestSourceTarget.count === 1 ? 'source' : 'sources'} ${isMobile ? 'in drawer' : 'on the right'}`
    : (isMobile ? 'Sources appear in drawer' : 'Sources appear on the right');
  const viewingLatestSources = latestSourceTarget
    && sourcePanelOpen
    && activeSourceMsgId === latestSourceTarget.messageId;

  const handleSourceSummaryOpen = useCallback(() => {
    if (latestSourceTarget) {
      openSourcePanel(latestSourceTarget.messageId);
    }
  }, [latestSourceTarget, openSourcePanel]);

  return (
    <Box className="chat-shell">
      {/* Main chat area */}
      <Box className="chat-column chat-surface">
        <Box className="chat-topbar">
          <Group justify="space-between" align="flex-start">
            <Stack gap={6}>
              <Text className="page-intro__eyebrow" mb={0}>
                Chat Workspace
              </Text>
              <Title order={2}>
                {sessionDetail?.title || `Ask ${project?.name ?? 'your project'}`}
              </Title>
              <Text size="sm" className="muted-copy">
                Ground answers in indexed documents and open cited evidence as you read.
              </Text>
            </Stack>

            <Group gap="sm">
              <span className="page-pill">
                <IconSparkles size={16} />
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </span>
              <UnstyledButton
                className="page-pill page-pill-button"
                onClick={handleSourceSummaryOpen}
                disabled={!latestSourceTarget}
                aria-label={latestSourceTarget ? 'Open source evidence' : 'No source evidence yet'}
                data-active={viewingLatestSources ? 'true' : undefined}
              >
                <IconBooks size={16} />
                {viewingLatestSources ? `Viewing ${sourceSummaryLabel}` : sourceSummaryLabel}
              </UnstyledButton>
            </Group>
          </Group>
        </Box>

        {/* Warning banners */}
        <Stack gap="sm" p="md" pb={0}>
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
              radius="xl"
            >
              Index may be out of date. Answers might not reflect recent document changes.{' '}
              <a
                href={`/projects/${projectId}`}
                onClick={(e) => { e.preventDefault(); void navigate(`/projects/${projectId}`); }}
                style={{ color: 'var(--mantine-color-ocean-7)' }}
              >
                Rebuild index
              </a>
            </Alert>
          )}
        </Stack>

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
