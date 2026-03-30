import { useEffect } from 'react';
import { Loader2, Send, StopCircle } from 'lucide-react';
import type { SpeechCapabilityState, SpeechErrorNotice, SpeechRecognitionState } from '@/types/speech';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SpeechCaptureButton } from './SpeechCaptureButton';
import { SpeechInlineNotice } from './SpeechInlineNotice';

interface ChatComposerSpeechCapabilities {
  stt: SpeechCapabilityState;
  tts: SpeechCapabilityState;
}

export interface ChatComposerSpeechController {
  speechCapabilities: ChatComposerSpeechCapabilities;
  microphonePermission: 'granted' | 'prompt' | 'denied' | 'unsupported' | 'pending';
  speechRecognitionState: SpeechRecognitionState;
  speechError: SpeechErrorNotice | null;
  onPressStart: () => void | Promise<boolean>;
  onCommit: () => void;
  onCancel: () => void;
}

interface ChatComposerProps {
  value: string;
  onChange: (nextValue: string) => void;
  onSend: () => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  placeholder: string;
  speechController: ChatComposerSpeechController;
}

function isRecognitionNotice(notice: SpeechErrorNotice | null) {
  if (!notice) {
    return false;
  }

  return notice.code !== 'playback-blocked' && notice.code !== 'playback-interrupted';
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStopStreaming,
  isStreaming,
  placeholder,
  speechController,
}: ChatComposerProps) {
  const {
    speechCapabilities,
    microphonePermission,
    speechRecognitionState,
    speechError,
    onPressStart,
    onCommit,
    onCancel,
  } = speechController;

  const isArming = speechRecognitionState === 'arming';
  const isRecording = isArming || speechRecognitionState === 'listening';
  const isProcessing = speechRecognitionState === 'processing';

  useEffect(() => {
    if (!isRecording) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, onCancel]);

  const recognitionNotice =
    microphonePermission === 'pending'
      ? {
          code: 'unknown' as const,
          title: 'Microphone access pending',
          message: 'Allow microphone access to dictate your question.',
        }
      : isRecognitionNotice(speechError)
        ? speechError
        : null;

  return (
    <div className="space-y-2">
      {isStreaming ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Wait for the current answer to finish before dictating another question.
        </div>
      ) : null}

      {recognitionNotice ? <SpeechInlineNotice notice={recognitionNotice} /> : null}

      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();

              if (!isStreaming && value.trim()) {
                onSend();
              }
            }
          }}
          placeholder={placeholder}
          className="min-h-[44px] max-h-32 resize-none"
          rows={1}
        />

        {speechCapabilities.stt === 'available' ? (
          <SpeechCaptureButton
            disabled={isStreaming}
            isRecording={isRecording}
            isProcessing={isProcessing || isArming}
            onPressStart={() => {
              void onPressStart();
            }}
            onCommit={onCommit}
            onCancel={onCancel}
          />
        ) : null}

        {isStreaming ? (
          <Button type="button" size="icon" onClick={onStopStreaming} aria-label="Stop generating response">
            <StopCircle className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={!value.trim() || isProcessing}
            aria-label="Send message"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
