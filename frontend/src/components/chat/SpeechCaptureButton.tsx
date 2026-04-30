import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SpeechCaptureButtonProps {
  disabled: boolean;
  isArming: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  onPressStart: () => void;
  onCommit: () => void;
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
  isArming,
  isRecording,
  isProcessing,
  onPressStart,
  onCommit,
}: SpeechCaptureButtonProps) {
  const handleClick = () => {
    if (disabled || isProcessing || isArming) return;

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
      disabled={disabled || isProcessing || isArming}
      onClick={handleClick}
      aria-label={
        isProcessing
          ? 'Transcribing recording'
          : isArming
            ? 'Waiting for microphone access'
          : isRecording
            ? 'Recording. Click to finish dictation'
            : 'Click to start dictation'
      }
      aria-pressed={isArming || isRecording}
      className={cn(
        'shrink-0 transition-all',
        isArming && 'border-amber-500/60 bg-amber-500/10 text-amber-700 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
        isRecording && 'shadow-[0_0_0_4px_rgba(239,68,68,0.25)] animate-pulse',
      )}
    >
      {isProcessing ? (
        <Loader2 className="animate-spin" />
      ) : isArming ? (
        <Loader2 className="animate-spin" />
      ) : isRecording ? (
        <MicOff />
      ) : (
        <Mic />
      )}
    </Button>
  );
}
