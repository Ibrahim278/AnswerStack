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

class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event & { error?: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  maxAlternatives = 1;
  onstart: ((event: Event) => void) | null = null;
  onresult: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;

  start() {}

  stop() {}

  abort() {}
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

function createMockSynth() {
  const spoken: FakeUtterance[] = [];

  return {
    synth: {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn((utterance: FakeUtterance) => {
        spoken.push(utterance);
      }),
    },
    spoken,
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

  const { synth } = createMockSynth();
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: synth,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: FakeUtterance,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: FakeRecognition,
  });

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
    commitCapture: vi.fn(),
    cancelCapture: vi.fn(() => {
      useChatStore.setState({ speechRecognitionState: 'idle' });
    }),
    cleanup: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  resetChatStore();
});

describe('MessageActionBar', () => {
  it('keeps the speech button hidden when TTS capability is unavailable', () => {
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

  it('disables the play button while a new answer is generating', () => {
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

  it('replaying the active message stops playback instead of creating overlap', () => {
    const { synth, spoken } = createMockSynth();

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synth,
        UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      }),
    );

    act(() => {
      result.current.playMessage('answer-1');
      spoken[0]?.onstart?.(new Event('start'));
    });

    act(() => {
      result.current.playMessage('answer-1');
    });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });
});

describe('AssistantMessage', () => {
  it('playback error notice can render under the relevant assistant message', () => {
    const message = createAssistantMessage();

    useChatStore.setState({
      speechError: {
        code: 'playback-blocked',
        title: 'Playback blocked',
        message: 'The browser blocked playback from starting. Interact with the page and try again.',
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
      screen.getByText('The browser blocked playback from starting. Interact with the page and try again.'),
    ).toBeInTheDocument();
  });
});

describe('ChatPage speech playback coordination', () => {
  it('playback request during recording follows cancel-then-play behavior', async () => {
    const { synth } = createMockSynth();
    const cancelCapture = vi.fn(() => {
      useChatStore.setState({ speechRecognitionState: 'idle' });
    });

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: synth,
    });

    useChatStore.setState({
      speechCapabilities: { stt: 'available', tts: 'available' },
      speechRecognitionState: 'listening',
      speechCommittedPrefix: 'Draft question',
    });

    mocks.useSpeechRecognition.mockReturnValue({
      startCapture: vi.fn(async () => true),
      commitCapture: vi.fn(),
      cancelCapture,
      cleanup: vi.fn(),
    });

    renderChatPage();

    fireEvent.click(await screen.findByLabelText('Read answer aloud'));

    await waitFor(() => {
      expect(cancelCapture).toHaveBeenCalled();
      expect(synth.speak).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('textbox')).toHaveValue('Draft question');
    });

    expect(cancelCapture.mock.invocationCallOrder[0]).toBeLessThan(
      synth.speak.mock.invocationCallOrder[0],
    );
    expect((synth.speak.mock.calls[0]?.[0] as FakeUtterance | undefined)?.text).toBe('Answer content');
  });
});
