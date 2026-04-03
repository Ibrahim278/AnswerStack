import { AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useBuildIndex } from '@/hooks/useIndexing';

interface StaleBannerProps {
  staleCount: number;
  projectId: string;
}

export function StaleBanner({ staleCount, projectId }: StaleBannerProps) {
  const buildIndex = useBuildIndex();

  if (staleCount <= 0) return null;

  return (
    <Alert className="border-orange-500/30 bg-orange-500/5">
      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      <AlertTitle className="text-orange-700 dark:text-orange-400">
        Index is out of date
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
          <div className="space-y-0.5">
            <p className="text-sm text-foreground">
              {staleCount} document{staleCount !== 1 ? 's' : ''} changed since
              the last successful build.
            </p>
            <p className="text-sm text-muted-foreground">
              Rebuild now so chat answers reflect the newest file set.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-orange-500/30 text-orange-700 hover:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/10"
            onClick={() => buildIndex.mutate(projectId)}
            disabled={buildIndex.isPending}
          >
            {buildIndex.isPending ? 'Rebuilding...' : 'Rebuild Index'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
