import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary that catches render errors and shows a
 * user-friendly fallback instead of the React dev stack trace.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/projects';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 pt-6">
              <AlertTriangle className="h-14 w-14 text-warning" />
              <h2 className="text-center text-xl font-semibold text-foreground">
                Something went wrong
              </h2>
              <p className="text-center text-sm text-muted-foreground">
                An unexpected error occurred. You can try reloading the page
                or going back to the projects list.
              </p>
              {this.state.error && (
                <div className="w-full">
                  <pre className="max-h-[120px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
                    {this.state.error.message}
                  </pre>
                </div>
              )}
              <div className="flex w-full flex-col gap-2">
                <Button onClick={this.handleReload} className="w-full">
                  Reload Page
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="w-full">
                  Back to Projects
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
