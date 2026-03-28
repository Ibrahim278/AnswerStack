import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Send, Plus, MessageSquare, Trash2, StopCircle,
  Loader2, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProject } from '@/hooks/useProjects';
import { useSessionList, useDeleteSession, useSessionDetail } from '@/hooks/useSessions';
import { useChat } from '@/hooks/useChat';
import { useChatStore } from '@/stores/chatStore';
import { isValidUuid } from '@/utils/isValidUuid';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { StreamingMessage } from '@/components/chat/StreamingMessage';
import { SourcePanel } from '@/components/chat/SourcePanel';

export default function ChatPage() {
  const { id, sessionId: routeSessionId } = useParams<{ id: string; sessionId?: string }>();
  const navigate = useNavigate();

  const routeProjectId = id ?? '';
  const projectId = isValidUuid(routeProjectId) ? routeProjectId : '';

  const { data: project, isLoading: projectLoading, isError: projectError } = useProject(projectId);
  const { data: sessions = [] } = useSessionList(projectId);
  const deleteSessionMutation = useDeleteSession(projectId);

  // Session detail for loading message history
  const { data: sessionDetail } = useSessionDetail(projectId, routeSessionId);
  const messages = sessionDetail?.messages ?? [];

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // SSE streaming
  const handleSessionCreated = useCallback(
    (newSessionId: string) => {
      navigate(`/projects/${projectId}/chat/${newSessionId}`, { replace: true });
    },
    [navigate, projectId],
  );

  const { sendMessage, stop, isStreaming } = useChat({
    projectId,
    onSessionCreated: handleSessionCreated,
  });

  const accumulatedTokens = useChatStore((s) => s.accumulatedTokens);
  const streamError = useChatStore((s) => s.streamError);
  const sourcePanelOpen = useChatStore((s) => s.sourcePanelOpen);
  const closeSourcePanel = useChatStore((s) => s.closeSourcePanel);

  // Close source panel when there's no active session
  useEffect(() => {
    if (!routeSessionId && sourcePanelOpen) {
      closeSourcePanel();
    }
  }, [routeSessionId, sourcePanelOpen, closeSourcePanel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, accumulatedTokens]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const content = input.trim();
    setInput('');
    void sendMessage({ question: content, sessionId: routeSessionId });
  }, [input, isStreaming, sendMessage, routeSessionId]);

  const handleStop = () => { stop(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    navigate(`/projects/${projectId}/chat`);
  };

  const handleSelectSession = (sid: string) => {
    navigate(`/projects/${projectId}/chat/${sid}`);
  };

  const handleDeleteSession = (sid: string) => {
    deleteSessionMutation.mutate(sid, {
      onSuccess: () => {
        if (routeSessionId === sid) {
          navigate(`/projects/${projectId}/chat`);
        }
      },
    });
  };

  // Determine last assistant message index for retry button
  const lastAssistantIdx = messages.reduceRight(
    (found: number, msg, idx) => (found === -1 && msg.role === 'assistant' ? idx : found),
    -1,
  );

  const suggestedPrompts = [
    'What are the key findings?',
    'Summarize the main points',
    'What are the trends?',
    'Compare the data across documents',
  ];

  // Invalid project ID
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Invalid project link</h3>
          <p className="text-sm text-muted-foreground mb-4">This project URL is not valid.</p>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  // Project loading
  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Project not found
  if (projectError || !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Project not found</h3>
          <p className="text-sm text-muted-foreground mb-4">This project does not exist or has been deleted.</p>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-64 border-r border-border flex flex-col bg-surface-sunken shrink-0 hidden lg:flex overflow-hidden">
        <div className="p-3 border-b border-border">
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleNewChat}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-2 space-y-0.5">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={cn(
                  'group w-full flex items-center text-left px-2.5 py-2 rounded-md text-sm transition-colors',
                  routeSessionId === session.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="truncate flex-1 min-w-0">{session.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-opacity shrink-0 ml-1"
                  onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground px-2.5 py-4 text-center">No conversations yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!routeSessionId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Ask your knowledge base</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Start a conversation to get source-grounded answers from your documents.
              </p>

              {/* Quick start: type a question directly */}
              <div className="max-w-md mx-auto mb-6">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim()) {
                          void sendMessage({ question: input.trim() });
                          setInput('');
                        }
                      }
                    }}
                    placeholder="Ask a question to start a new chat..."
                    className="min-h-[44px] max-h-32 resize-none"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={() => {
                      if (input.trim()) {
                        void sendMessage({ question: input.trim() });
                        setInput('');
                      }
                    }}
                    disabled={!input.trim() || isStreaming}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4">Or try a suggested prompt:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedPrompts.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { void sendMessage({ question: prompt }); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1 px-4 lg:px-8 py-6">
              <div className="max-w-[800px] mx-auto space-y-6">
                {messages.length === 0 && !isStreaming && (
                  <div className="text-center pt-12 pb-6">
                    <p className="text-sm text-muted-foreground mb-4">Try one of these prompts to get started:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestedPrompts.map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                          className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <ChatMessage
                        message={msg}
                        isLastAssistant={idx === lastAssistantIdx}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Streaming message */}
                {isStreaming && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <StreamingMessage />
                  </motion.div>
                )}

                {/* Stream error */}
                {streamError && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-destructive">{streamError.message}</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="border-t border-border p-4 bg-background">
              <div className="max-w-[800px] mx-auto flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your documents..."
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                />
                {isStreaming ? (
                  <Button variant="outline" size="icon" onClick={handleStop}>
                    <StopCircle className="w-4 h-4 text-destructive" />
                  </Button>
                ) : (
                  <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Source panel */}
      <AnimatePresence>
        {sourcePanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden shrink-0 hidden lg:block"
          >
            <SourcePanel messages={messages} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
