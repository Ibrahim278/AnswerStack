import { Activity, Server, Database, Loader2, AlertCircle, WifiOff } from 'lucide-react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';

export default function StatusPage() {
  const { data: status, isLoading, isError, showOverlay } = useSystemStatus();
  const { data: settings } = useSettings();

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">System Status</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor system health and capabilities</p>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
          <WifiOff className="w-10 h-10 text-destructive/60 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Cannot reach backend</h3>
          <p className="text-sm text-muted-foreground">
            The system status endpoint is not responding. Check that the backend server is running.
          </p>
        </div>
      </div>
    );
  }

  const capStatus = (s: boolean) => (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs',
      s ? 'text-success' : 'text-destructive'
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        s ? 'bg-success' : 'bg-destructive'
      )} />
      {s ? 'available' : 'unavailable'}
    </span>
  );

  const providerStatus = () => {
    const configured = status.provider.configured;
    const connected = status.provider.connected;
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        connected ? 'text-success' : configured ? 'text-warning' : 'text-destructive'
      )}>
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-success' : configured ? 'bg-warning' : 'bg-destructive'
        )} />
        {connected ? 'connected' : configured ? 'configured but not connected' : 'not configured'}
      </span>
    );
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">System Status</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor system health and capabilities</p>
      </div>

      {showOverlay && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Connection unstable</p>
            <p className="text-xs text-destructive/80">Multiple consecutive status checks have failed.</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Overall readiness */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">System Readiness</h3>
                <StatusBadge status={status.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">Provider</h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                {providerStatus()}
              </div>
              {settings && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Model</span>
                    <span className="text-xs font-mono text-foreground">{settings.provider_model || 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">URL</span>
                    <span className="text-xs font-mono text-foreground truncate max-w-[180px]">{settings.provider_url || 'Not set'}</span>
                  </div>
                </>
              )}
              {status.provider.last_error && (
                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border">
                  <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                  <span className="text-[11px] text-destructive">{status.provider.last_error}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">Infrastructure</h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Database</span>
                {capStatus(status.health.database)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Vector Store</span>
                {capStatus(status.health.vector_store)}
              </div>
            </div>
          </div>

          {/* Project-specific status */}
          {status.project && (
            <div className="bg-card border border-border rounded-lg p-4 md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">Active Project</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground block">Index Status</span>
                  <span className="text-sm font-medium text-foreground">{status.project.index_status}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Documents</span>
                  <span className="text-sm font-medium text-foreground">{status.project.documents_total}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Stale</span>
                  <span className="text-sm font-medium text-foreground">{status.project.documents_stale}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Last Indexed</span>
                  <span className="text-sm font-medium text-foreground">
                    {status.project.last_indexed
                      ? new Date(status.project.last_indexed).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>
              {status.project.active_job && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-foreground">
                    Active job: {status.project.active_job.status} ({status.project.active_job.progress_current}/{status.project.active_job.progress_total})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
