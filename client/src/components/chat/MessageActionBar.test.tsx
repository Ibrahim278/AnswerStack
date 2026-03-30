import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ChatMessageResponse } from '@/types';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { useChatStore } from '@/stores/chatStore';
import ChatPage from '@/pages/ChatPage';
import { AssistantMessage } from './AssistantMessage';
import { MessageActionBar } from './MessageActionBar';

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  useSessionList: vi.fn(),
  useDeleteSession: vi.fn(),
  useSessionDetail: vi.fn(),
  useChat: vi.fn(),
  useSpeechRecognition: vi.fn(),
  useSpeechSynthesis: vi.fn(),
  detectSpeechCapabilities: vi.fn(),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProject: mocks.useProject,
}));

vi.mock('@/hooks/useSessions', () => ({
  useSessionList: mocks.useSessionList,
  useDeleteSession: mocks.useDeleteSession,
  useSessionDetail: mocks.useSessionDetail,
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: mocks.useChat,
}));

vi.mock('@/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: mocks.useSpeechRecognition,
}));

vi.mock('@/hooks/useSpeechSynthesis', () => ({
  useSpeechSynthesis: mocks.useSpeechSynthesis,
}));

vi.mock('@/lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/speech')>();
  return {
    ...actual,
    detectSpeechCapabilities: mocks.detectSpeechCapabilities,
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

class MockAudio {
  src = '';
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.onplay?.();
  });
  pause = vi.fn();
}

const PROJECT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SESSION_ID = 'session-1';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

function createAssistantMessage(
  overrides: Partial<ChatMessageResponse> = {},
): ChatMessageResponse {
  return {
    id: 'assistant-1',
    session_id: SESSION_ID,
    role: 'assistant',
    content: 'Answer content',
    sources_json: [],
    created_at: '2026-03-30T00:00:00Z',
    ...overrides,
  };
}

function renderChatPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/chat/${SESSION_ID}`]}>
      <Routes>
        <Route path="/projects/:id/chat" element={<ChatPage />} />
        <Route path="/projects/:id/chat/:sessionId" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetChatStore();

  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });

  // Mock Audio constructor and URL for backend-proxied TTS
  const mockAudio = new MockAudio();
  globalThis.Audio = vi.fn(() => mockAudio) as unknown as typeof Audio;
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();

  mocks.useProject.mockReturnValue({
    data: { id: PROJECT_ID, name: 'AnswerStack Demo Project' },
    isLoading: false,
    isError: false,
  });
  mocks.useSessionList.mockReturnValue({
    data: [{ id: SESSION_ID, title: 'Demo session' }],
  });
  mocks.useDeleteSession.mockReturnValue({
    mutate: vi.fn(),
  });
  mocks.useSessionDetail.mockReturnValue({
    data: {
      id: SESSION_ID,
      messages: [createAssistantMessage()],
    },
  });
  mocks.useChat.mockReturnValue({
    sendMessage: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
    isStreaming: false,
  });
  mocks.useSpeechRecognition.mockReturnValue({
    startCapture: vi.fn(async () => true),
    commitCapture: vi.fn(async () => {}),
    cancelCapture: vi.fn(() => {
      useChatStore.setState({ speechRecognitionState: 'idle' });
    }),
    cleanup: vi.fn(),
  });

  mocks.useSpeechSynthesis.mockReturnValue({
    playMessage: vi.fn(async () => true),
    stopPlayback: vi.fn(),
    cleanup: vi.fn(),
  });

  mocks.detectSpeechCapabilities.mockResolvedValue({
    stt: 'available',
    tts: 'available',
    backendSttAvailable: true,
    backendTtsAvailable: true,
    sttProvider: 'elevenlabs',
    ttsProvider: 'elevenlabs',
    microphonePermission: 'pending',
  });
});

afterEach(() => {
  vi.clearAllMocks();
  resetChatStore();
});

describe('MessageActionBar', () => {
  it('renders copy button always', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech={false}
        speechDisabled={false}
        isSpeaking={false}
      />,
    );

    expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
  });

  it('shows play button when showSpeech is true', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled={false}
        isSpeaking={false}
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Read answer aloud')).toBeInTheDocument();
  });

  it('keeps the speech button hidden when showSpeech is false', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech={false}
        speechDisabled={false}
        isSpeaking={false}
      />,
    );

    expect(screen.queryByLabelText('Read answer aloud')).not.toBeInTheDocument();
  });

  it('clicking play calls onToggleSpeech(messageId)', () => {
    const onToggleSpeech = vi.fn();

    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled={false}
        isSpeaking={false}
        onToggleSpeech={onToggleSpeech}
      />,
    );

    fireEvent.click(screen.getByLabelText('Read answer aloud'));

    expect(onToggleSpeech).toHaveBeenCalledWith('answer-1');
  });

  it('shows stop icon and label when isSpeaking', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled={false}
        isSpeaking
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Stop reading aloud')).toBeInTheDocument();
    expect(screen.queryByLabelText('Read answer aloud')).not.toBeInTheDocument();
  });

  it('swaps from "Read answer aloud" to "Stop reading aloud" for the active message', () => {
    const { rerender } = render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled={false}
        isSpeaking={false}
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Read answer aloud')).toBeInTheDocument();

    rerender(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled={false}
        isSpeaking
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Stop reading aloud')).toBeInTheDocument();
  });

  it('disables the play button when speechDisabled and not speaking', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled
        isSpeaking={false}
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Read answer aloud')).toBeDisabled();
  });

  it('keeps play button enabled when speechDisabled but already speaking', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech
        speechDisabled
        isSpeaking
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Stop reading aloud')).not.toBeDisabled();
  });

  it('shows retry button when showRetry true', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry
        showSpeech={false}
        speechDisabled={false}
        isSpeaking={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Retry response')).toBeInTheDocument();
  });

  it('hides retry button when showRetry false', () => {
    render(
      <MessageActionBar
        content="Answer"
        messageId="answer-1"
        showRetry={false}
        showSpeech={false}
        speechDisabled={false}
        isSpeaking={false}
      />,
    );

    expect(screen.queryByLabelText('Retry response')).not.toBeInTheDocument();
  });

  it('replaying the active message stops playback instead of creating overlap', async () => {
    // Mock playMessage to toggle stop on second call for same message
    const playMessage = vi.fn(async (messageId: string) => {
      const state = useChatStore.getState();
      if (state.activePlaybackMessageId === messageId) {
        state.stopSpeechPlayback();
        return false;
      }
      state.startSpeechPlayback(messageId);
      state.setSpeechPlaying(messageId);
      return true;
    });

    mocks.useSpeechSynthesis.mockReturnValue({
      playMessage,
      stopPlayback: vi.fn(),
      cleanup: vi.fn(),
    });

    const { result } = renderHook(() => useSpeechSynthesis({ getMessageText: () => 'Answer' }));

    // Play the message first
    await act(async () => {
      await result.current.playMessage('answer-1');
    });

    // Toggle off by playing same message
    await act(async () => {
      await result.current.playMessage('answer-1');
    });

    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
  });
});

describe('AssistantMessage', () => {
  it('playback error notice can render under the relevant assistant message', () => {
    const message = createAssistantMessage();

    useChatStore.setState({
      speechError: {
        code: 'playback-blocked',
        title: 'Playback blocked',
        message: "Playback couldn't start. Click play again after interacting with the page.",
      },
      speechPlaybackErrorMessageId: message.id,
    });

    render(
      <AssistantMessage
        message={message}
        isLastAssistant
        showSpeech
        speechDisabled={false}
        isSpeaking={false}
        onToggleSpeech={vi.fn()}
      />,
    );

    expect(screen.getByText('Playback blocked')).toBeInTheDocument();
    expect(
      screen.getByText("Playback couldn't start. Click play again after interacting with the page."),
    ).toBeInTheDocument();
  });
});

describe('ChatPage speech playback coordination', () => {
  it('playback request during recording follows cancel-then-play behavior', async () => {
    const playMessage = vi.fn(async () => true);
    const cancelCapture = vi.fn(() => {
      useChatStore.setState({ speechRecognitionState: 'idle' });
    });

    useChatStore.setState({
      speechCapabilities: { stt: 'available', tts: 'available' },
      speechRecognitionState: 'listening',
      speechCommittedPrefix: 'Draft question',
    });

    mocks.useSpeechRecognition.mockReturnValue({
      startCapture: vi.fn(async () => true),
      commitCapture: vi.fn(async () => {}),
      cancelCapture,
      cleanup: vi.fn(),
    });

    mocks.useSpeechSynthesis.mockReturnValue({
      playMessage,
      stopPlayback: vi.fn(),
      cleanup: vi.fn(),
    });

    renderChatPage();

    fireEvent.click(await screen.findByLabelText('Read answer aloud'));

    await waitFor(() => {
      expect(cancelCapture).toHaveBeenCalled();
      expect(playMessage).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('textbox')).toHaveValue('Draft question');
    });

    expect(cancelCapture.mock.invocationCallOrder[0]).toBeLessThan(
      playMessage.mock.invocationCallOrder[0],
    );
    expect(playMessage).toHaveBeenCalledWith('assistant-1');
  });
});
