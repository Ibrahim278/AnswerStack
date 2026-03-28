import { useState, useEffect, useCallback } from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ConnectionOverlayProps {
  visible: boolean;
  onRetry: () => void;
}

export function ConnectionOverlay({ visible, onRetry }: ConnectionOverlayProps) {
  const [countdown, setCountdown] = useState(10);

  const handleRetry = useCallback(() => {
    setCountdown(10);
    onRetry();
  }, [onRetry]);

  useEffect(() => {
    if (!visible) {
      setCountdown(10);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [visible, handleRetry]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85">
      <Card className="border-border/50 bg-card/95 backdrop-blur-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-6 px-8 pb-6">
          <WifiOff className="h-16 w-16 text-warning" />
          <h2 className="text-xl font-semibold text-foreground">Cannot reach server</h2>
          <p className="text-sm text-muted-foreground">Attempting to reconnect...</p>
          <p className="text-xs text-muted-foreground">Retrying in {countdown}s...</p>
          <Button onClick={handleRetry} variant="secondary">
            Retry Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
