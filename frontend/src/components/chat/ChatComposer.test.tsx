import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpeechErrorNotice } from '@/types/speech';
import { ChatComposer, type ChatComposerSpeechController } from './ChatComposer';

interface ComposerHarnessProps {
  initialValue?: string;
  interimValue?: string;
  finalValue?: string;
  isStreaming?: boolean;
  microphonePermission?: ChatComposerSpeechController['microphonePermission'];
  speechRecognitionState?: ChatComposerSpeechController['speechRecognitionState'];
  speechError?: SpeechErrorNotice | null;
  stt?: ChatComposerSpeechController['speechCapabilities']['stt'];
  onSend?: () => void;
  onCommit?: () => void;
  onCancel?: () => void;
}

function attachPointerCaptureMocks(button: HTMLElement) {
  Object.defineProperty(button, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(button, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(button, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => true),
  });
}

function ComposerHarness({
  initialValue = 'Original question',
  interimValue = 'Original question with interim speech',
  finalValue = 'Original question with final speech',
  isStreaming = false,
  microphonePermission = 'granted',
  speechRecognitionState = 'idle',
  speechError = null,
  stt = 'available',
  onSend = vi.fn(),
  onCommit = vi.fn(),
  onCancel = vi.fn(),
}: ComposerHarnessProps) {
  const [value, setValue] = useState(initialValue);
  const [recognitionState, setRecognitionState] = useState(speechRecognitionState);

  const speechController: ChatComposerSpeechController = {
    speechCapabilities: {
      stt,
      tts: 'unavailable',
    },
    microphonePermission,
    speechRecognitionState: recognitionState,
    speechError,
    onPressStart: () => {
      setRecognitionState('listening');
      setValue(interimValue);
    },
    onCommit: () => {
      onCommit();
      setRecognitionState('idle');
      setValue(finalValue);
    },
    onCancel: () => {
      onCancel();
      setRecognitionState('idle');
      setValue(initialValue);
    },
  };

  return (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSend={onSend}
      onStopStreaming={vi.fn()}
      isStreaming={isStreaming}
      placeholder="Ask a question"
      speechController={speechController}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatComposer', () => {
  it('renders textarea and send button always', () => {
    render(<ComposerHarness stt="unavailable" />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Send message')).toBeInTheDocument();
  });

  it('shows mic button when stt is available', () => {
    render(<ComposerHarness stt="available" />);

    expect(screen.getByLabelText('Click to start dictation')).toBeInTheDocument();
  });

  it('keeps the microphone hidden when STT capability is unavailable', () => {
    render(<ComposerHarness stt="unavailable" />);

    expect(screen.queryByLabelText('Click to start dictation')).not.toBeInTheDocument();
  });

  it('click starts recording and updates textarea with interim transcript', async () => {
    render(<ComposerHarness />);

    const button = screen.getByLabelText('Click to start dictation');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });

    expect(screen.getByLabelText('Recording. Click to finish dictation')).toBeInTheDocument();
    expect(screen.getByText('Recording... Click the mic again to finish.')).toBeInTheDocument();
  });

  it('second click commits transcript and does not auto-send', async () => {
    const onSend = vi.fn();
    const onCommit = vi.fn();

    render(<ComposerHarness onSend={onSend} onCommit={onCommit} />);

    const button = screen.getByLabelText('Click to start dictation');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });

    // Second click commits
    fireEvent.click(screen.getByLabelText('Recording. Click to finish dictation'));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with final speech');
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Escape restores the original composer text', async () => {
    const onCancel = vi.fn();
    render(<ComposerHarness onCancel={onCancel} />);

    const button = screen.getByLabelText('Click to start dictation');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question');
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not show streaming banner when just streaming without active speech', () => {
    render(<ComposerHarness isStreaming />);

    expect(
      screen.queryByText('Wait for the current answer to finish before dictating another question.'),
    ).not.toBeInTheDocument();
  });

  it('shows streaming banner when dictating during streaming', () => {
    render(<ComposerHarness isStreaming speechRecognitionState="listening" />);

    expect(
      screen.getByText('Wait for the current answer to finish before dictating another question.'),
    ).toBeInTheDocument();
  });

  it('shows pending inline copy when the permission prompt is ignored', () => {
    render(<ComposerHarness microphonePermission="pending" />);

    expect(screen.getByText('Microphone access pending')).toBeInTheDocument();
    expect(
      screen.getByText('Allow microphone access to dictate your question.'),
    ).toBeInTheDocument();
  });

  it('shows an explicit arming state while waiting for microphone access', () => {
    render(<ComposerHarness speechRecognitionState="arming" />);

    expect(screen.getByLabelText('Waiting for microphone access')).toBeDisabled();
    expect(screen.queryByText('Waiting for microphone access')).not.toBeInTheDocument();
    expect(screen.queryByText('Approve the browser prompt to start recording.')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for microphone permission...')).not.toBeInTheDocument();
  });

  it('shows a processing state while transcribing recorded audio', () => {
    render(<ComposerHarness speechRecognitionState="processing" />);

    expect(screen.getByLabelText('Transcribing recording')).toBeDisabled();
    expect(screen.getByText('Transcribing your recording...')).toBeInTheDocument();
  });

  it('shows speech error notice for recognition errors', () => {
    render(
      <ComposerHarness
        speechError={{
          code: 'not-allowed',
          title: 'Microphone access blocked',
          message: 'Microphone access is blocked. Enable it in your browser settings, then hold to talk again.',
        }}
      />,
    );

    expect(screen.getByText('Microphone access blocked')).toBeInTheDocument();
    expect(
      screen.getByText('Microphone access is blocked. Enable it in your browser settings, then hold to talk again.'),
    ).toBeInTheDocument();
  });

  it('shows permission revocation recovery copy without reload after a prior successful render', () => {
    const { rerender } = render(<ComposerHarness microphonePermission="granted" />);

    rerender(
      <ComposerHarness
        microphonePermission="denied"
        speechError={{
          code: 'not-allowed',
          title: 'Microphone access blocked',
          message: 'Microphone access is blocked. Enable it in your browser settings, then hold to talk again.',
        }}
      />,
    );

    expect(screen.getByText('Microphone access blocked')).toBeInTheDocument();
    expect(screen.getByText('Allow microphone access in the browser, then try again.')).toBeInTheDocument();
  });

  it.each([
    {
      name: 'denial',
      notice: {
        code: 'not-allowed',
        title: 'Microphone access blocked',
        message: 'Microphone access is blocked. Enable it in your browser settings, then hold to talk again.',
      } satisfies SpeechErrorNotice,
    },
    {
      name: 'no-speech',
      notice: {
        code: 'no-speech',
        title: 'No speech detected',
        message: 'No speech detected. Hold to talk and speak before releasing.',
      } satisfies SpeechErrorNotice,
    },
    {
      name: 'network',
      notice: {
        code: 'network',
        title: 'Speech service interrupted',
        message: 'Speech service could not complete the request. Check your connection and try again.',
      } satisfies SpeechErrorNotice,
    },
  ])('shows inline $name recovery copy', ({ notice }) => {
    render(<ComposerHarness speechError={notice} />);

    expect(screen.getByText(notice.title)).toBeInTheDocument();
    expect(screen.getByText(notice.message)).toBeInTheDocument();
  });

  it('does not show playback errors as recognition notices', () => {
    render(
      <ComposerHarness
        speechError={{
          code: 'playback-blocked',
          title: 'Playback blocked',
          message: "Playback couldn't start. Click play again after interacting with the page.",
        }}
      />,
    );

    expect(screen.queryByText('Playback blocked')).not.toBeInTheDocument();
  });

  it('disables the mic button while streaming', () => {
    render(<ComposerHarness isStreaming />);

    expect(screen.getByLabelText('Click to start dictation')).toBeDisabled();
  });

  it('send button disabled when input empty', () => {
    render(<ComposerHarness initialValue="" />);

    expect(screen.getByLabelText('Send message')).toBeDisabled();
  });

  it('send button enabled when input has text', () => {
    render(<ComposerHarness initialValue="hello" />);

    expect(screen.getByLabelText('Send message')).not.toBeDisabled();
  });
});
