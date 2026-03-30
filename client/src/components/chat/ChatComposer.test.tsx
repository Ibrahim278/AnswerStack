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
  it('keeps the microphone hidden when STT capability is unavailable', () => {
    render(<ComposerHarness stt="unavailable" />);

    expect(screen.queryByLabelText('Hold to dictate your question')).not.toBeInTheDocument();
  });

  it('updates the textarea with interim transcript on pointerdown', async () => {
    render(<ComposerHarness />);

    const button = screen.getByLabelText('Hold to dictate your question');
    attachPointerCaptureMocks(button);

    fireEvent.pointerDown(button, { pointerId: 1, button: 0 });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });
  });

  it('release commits transcript and does not auto-send', async () => {
    const onSend = vi.fn();
    const onCommit = vi.fn();

    render(<ComposerHarness onSend={onSend} onCommit={onCommit} />);

    const button = screen.getByLabelText('Hold to dictate your question');
    attachPointerCaptureMocks(button);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => button),
    });

    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 12, clientY: 12 });
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });

    fireEvent.pointerUp(screen.getByLabelText('Release to keep transcript, drag away or press Escape to cancel'), {
      pointerId: 1,
      clientX: 12,
      clientY: 12,
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with final speech');
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Escape restores the original composer text', async () => {
    const onCancel = vi.fn();
    render(<ComposerHarness onCancel={onCancel} />);

    const button = screen.getByLabelText('Hold to dictate your question');
    attachPointerCaptureMocks(button);

    fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question with interim speech');
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Original question');
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows pending inline copy when the permission prompt is ignored', () => {
    render(<ComposerHarness microphonePermission="pending" />);

    expect(screen.getByText('Microphone permission pending')).toBeInTheDocument();
    expect(
      screen.getByText('The browser is still waiting for microphone permission. Approve or cancel the prompt, then try again.'),
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
          message: 'Microphone access is blocked. Allow access in Chromium and try again.',
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
        message: 'Microphone access is blocked. Allow access in Chromium and try again.',
      } satisfies SpeechErrorNotice,
    },
    {
      name: 'no-speech',
      notice: {
        code: 'no-speech',
        title: 'No speech detected',
        message: 'No speech was detected before recording ended. Try again and speak sooner.',
      } satisfies SpeechErrorNotice,
    },
  ])('shows inline $name recovery copy', ({ notice }) => {
    render(<ComposerHarness speechError={notice} />);

    expect(screen.getByText(notice.title)).toBeInTheDocument();
    expect(screen.getByText(notice.message)).toBeInTheDocument();
  });

  it('disables the mic button while streaming', () => {
    render(<ComposerHarness isStreaming />);

    expect(screen.getByLabelText('Hold to dictate your question')).toBeDisabled();
    expect(
      screen.getByText('Wait for the current answer to finish before dictating another question.'),
    ).toBeInTheDocument();
  });
});
