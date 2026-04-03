import type { SpeechErrorNotice } from '@/types/speech';

interface SpeechInlineNoticeProps {
  notice: SpeechErrorNotice;
}

function getRecoveryHint(code: SpeechErrorNotice['code']) {
  switch (code) {
    case 'not-allowed':
      return 'Allow microphone access in the browser, then try again.';
    case 'unknown':
      return 'The browser is still waiting for microphone permission. Approve or cancel the prompt, then try again.';
    case 'no-speech':
      return 'No speech was detected. Hold the button and speak before releasing.';
    case 'not-supported':
      return 'Speech input is not available in this browser.';
    default:
      return null;
  }
}

export function SpeechInlineNotice({ notice }: SpeechInlineNoticeProps) {
  const recoveryHint = getRecoveryHint(notice.code);

  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-left">
      <p className="text-sm font-medium text-foreground">{notice.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{notice.message}</p>
      {recoveryHint ? <p className="mt-2 text-xs text-muted-foreground">{recoveryHint}</p> : null}
    </div>
  );
}
