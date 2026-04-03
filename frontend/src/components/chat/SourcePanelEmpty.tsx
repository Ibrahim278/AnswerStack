import { FileX } from 'lucide-react';

/**
 * Empty state display when no sources are available for the selected message.
 */
export function SourcePanelEmpty() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <FileX className="w-12 h-12 text-muted-foreground/40" />
        <h4 className="font-semibold text-base text-foreground">No sources found</h4>
        <p className="text-sm text-muted-foreground max-w-[240px]">
          The answer was generated without supporting evidence from your documents.
        </p>
      </div>
    </div>
  );
}
