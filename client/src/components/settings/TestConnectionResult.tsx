import { CheckCircle2, XCircle, Loader2, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CapabilityResult, ConnectionTestResult } from '@/types';

interface TestConnectionResultProps {
  result: ConnectionTestResult | null;
  isPending: boolean;
  isError: boolean;
}

function statusIcon(result: CapabilityResult | undefined, isPending: boolean) {
  if (isPending) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
  if (!result) return null;

  switch (result.status) {
    case 'pass':
    case 'ok':
    case 'available':
      return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    case 'fail':
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case 'skip':
      return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function statusLabel(result: CapabilityResult | undefined, isPending: boolean) {
  if (isPending) return 'Testing...';
  if (!result) return '';
  return result.status;
}

function isPass(status: string) {
  return status === 'pass' || status === 'ok' || status === 'available';
}

function CapabilityRow({
  label,
  result,
  isPending,
}: {
  label: string;
  result: CapabilityResult | undefined;
  isPending: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-2 min-w-[100px]">
        {statusIcon(result, isPending)}
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      <span
        className={cn(
          'text-[10px] font-medium px-1.5 py-0.5 rounded',
          isPending && 'bg-muted text-muted-foreground',
          !isPending && result && isPass(result.status) && 'bg-success/10 text-success',
          !isPending && result && !isPass(result.status) && result.status !== 'skip' && 'bg-destructive/10 text-destructive',
          !isPending && result && result.status === 'skip' && 'bg-muted text-muted-foreground'
        )}
      >
        {statusLabel(result, isPending)}
      </span>
      {!isPending && result?.status === 'fail' && result.message && (
        <span className="text-xs text-destructive flex-1">{result.message}</span>
      )}
    </div>
  );
}

export function TestConnectionResult({ result, isPending, isError }: TestConnectionResultProps) {
  if (!result && !isPending && !isError) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Connection Test Results</CardTitle>
      </CardHeader>
      <CardContent>
        {isError && !isPending && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            Connection test failed. Check the provider URL and try again.
          </div>
        )}

        {(isPending || result) && (
          <div className="space-y-2">
            <CapabilityRow
              label="Auth"
              result={result?.auth}
              isPending={isPending}
            />
            <CapabilityRow
              label="Chat"
              result={result?.chat}
              isPending={isPending}
            />
            <CapabilityRow
              label="Embedding"
              result={result?.embedding}
              isPending={isPending}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
