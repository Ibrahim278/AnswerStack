import { Mic, Loader2 } from 'lucide-react';
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

function isPointerInsideButton(target: HTMLButtonElement, clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  return element instanceof Node ? target.contains(element) : false;
}

export function SpeechCaptureButton({
  disabled,
  isRecording,
  isProcessing,
  onPressStart,
  onCommit,
  onCancel,
}: SpeechCaptureButtonProps) {
  return (
    <Button
      type="button"
      variant={isRecording ? 'destructive' : 'outline'}
      size="icon"
      disabled={disabled || isProcessing}
      aria-label={
        isRecording
          ? 'Release to keep transcript, drag away or press Escape to cancel'
          : 'Hold to dictate your question'
      }
      className={cn(
        'shrink-0 transition-colors',
        isRecording && 'shadow-[0_0_0_4px_rgba(239,68,68,0.16)]',
      )}
      onPointerDown={(event) => {
        if (disabled || isProcessing) {
          return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPressStart();
      }}
      onPointerUp={(event) => {
        if (!isRecording) {
          return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (isPointerInsideButton(event.currentTarget, event.clientX, event.clientY)) {
          onCommit();
          return;
        }

        onCancel();
      }}
      onPointerLeave={() => {
        if (isRecording) {
          onCancel();
        }
      }}
      onPointerCancel={() => {
        if (isRecording) {
          onCancel();
        }
      }}
    >
      {isProcessing ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Mic className={cn(isRecording && 'animate-pulse')} />
      )}
    </Button>
  );
}
