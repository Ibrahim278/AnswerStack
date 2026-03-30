import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SpeechCaptureButtonProps {
  disabled: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  onPressStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * Click-to-toggle mic button.
 *
 * First click starts capture (may trigger permission prompt).
 * Second click commits the recording and sends for transcription.
 * Visual states: idle → recording (red pulse) → processing (spinner).
 */
export function SpeechCaptureButton({
  disabled,
  isRecording,
  isProcessing,
  onPressStart,
  onCommit,
  onCancel: _onCancel,
}: SpeechCaptureButtonProps) {
  const handleClick = () => {
    if (disabled || isProcessing) return;

    if (isRecording) {
      onCommit();
    } else {
      onPressStart();
    }
  };

  return (
    <Button
      type="button"
      variant={isRecording ? 'destructive' : 'outline'}
      size="icon"
      disabled={disabled || isProcessing}
      onClick={handleClick}
      aria-label={
        isProcessing
          ? 'Transcribing...'
          : isRecording
            ? 'Click to finish recording'
            : 'Click to start dictation'
      }
      className={cn(
        'shrink-0 transition-all',
        isRecording && 'shadow-[0_0_0_4px_rgba(239,68,68,0.25)] animate-pulse',
      )}
    >
      {isProcessing ? (
        <Loader2 className="animate-spin" />
      ) : isRecording ? (
        <MicOff />
      ) : (
        <Mic />
      )}
    </Button>
  );
}
