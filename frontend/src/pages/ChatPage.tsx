import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, MessageSquare, Trash2,
  Loader2, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useProject } from '@/hooks/useProjects';
import { useSessionList, useDeleteSession, useSessionDetail } from '@/hooks/useSessions';
import { useChat } from '@/hooks/useChat';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { useSuggestedPrompts } from '@/hooks/useSuggestedPrompts';
import { useIndexingStatus } from '@/hooks/useIndexing';
import { detectSpeechCapabilities } from '@/lib/speech';
import { useChatStore } from '@/stores/chatStore';
import { isValidUuid } from '@/utils/isValidUuid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssistantMessage } from '@/components/chat/AssistantMessage';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { StreamingMessage } from '@/components/chat/StreamingMessage';
import { SourcePanel } from '@/components/chat/SourcePanel';
import { UserMessage } from '@/components/chat/UserMessage';

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
  const previousRouteSessionIdRef = useRef(routeSessionId);

  const {
    speechCapabilities, microphonePermission, speechRecognitionState,
    speechPlaybackState, speechError, speechCommittedPrefix,
    activePlaybackMessageId, setSpeechCapabilities,
  } = useChatStore(useShallow((s) => ({
    speechCapabilities: s.speechCapabilities,
    microphonePermission: s.microphonePermission,
    speechRecognitionState: s.speechRecognitionState,
    speechPlaybackState: s.speechPlaybackState,
    speechError: s.speechError,
    speechCommittedPrefix: s.speechCommittedPrefix,
    activePlaybackMessageId: s.activePlaybackMessageId,
    setSpeechCapabilities: s.setSpeechCapabilities,
  })));

  const isSpeechArming = speechRecognitionState === 'arming';
  const isSpeechListening = speechRecognitionState === 'listening';
  const isSpeechRecording = isSpeechArming || isSpeechListening;

  // SSE streaming
  const handleSessionCreated = useCallback(
    (newSessionId: string) => {
      if (isSpeechRecording) {
        setInput(speechCommittedPrefix);
      }
      navigate(`/projects/${projectId}/chat/${newSessionId}`, { replace: true });
    },
    [isSpeechRecording, navigate, projectId, speechCommittedPrefix],
  );

  const { sendMessage, stop, retry, abort, isStreaming } = useChat({
    projectId,
    onSessionCreated: handleSessionCreated,
  });

  const { streamError, sourcePanelOpen, closeSourcePanel, streamingMessageId } = useChatStore(
    useShallow((s) => ({
      streamError: s.streamError,
      sourcePanelOpen: s.sourcePanelOpen,
      closeSourcePanel: s.closeSourcePanel,
      streamingMessageId: s.streamingMessageId,
    })),
  );

  const speechRecognition = useSpeechRecognition({
    value: input,
    onInterimText: (nextValue) => setInput(nextValue),
    onCommit: (finalValue) => setInput(finalValue),
    onCancel: (restoreValue) => setInput(restoreValue),
  });
  const getMessageText = useCallback(
    (messageId: string) =>
      messages.find((message) => message.id === messageId)?.content ?? '',
    [messages],
  );
  const speechSynthesis = useSpeechSynthesis({ getMessageText });
  const {
    startCapture,
    commitCapture,
    cancelCapture,
  } = speechRecognition;
  const cleanupSpeechRecognition = useCallback(
    () => speechRecognition.cleanup(),
    [speechRecognition.cleanup],
  );
  const stopSpeechPlayback = useCallback(
    () => speechSynthesis.stopPlayback(),
    [speechSynthesis.stopPlayback],
  );
  const cleanupSpeechSynthesis = useCallback(
    () => speechSynthesis.cleanup(),
    [speechSynthesis.cleanup],
  );

  const cancelRecordingIfActive = useCallback(() => {
    if (isSpeechRecording) {
      cancelCapture();
    }
  }, [cancelCapture, isSpeechRecording]);

  const handleSpeechStart = useCallback(async () => {
    if (isStreaming) {
      return false;
    }

    stopSpeechPlayback();
    return startCapture();
  }, [isStreaming, microphonePermission, speechRecognitionState, startCapture, stopSpeechPlayback]);

  const handleToggleSpeech = useCallback(
    (messageId: string) => {
      if (isSpeechRecording) {
        cancelCapture();
        setInput(speechCommittedPrefix);
      }

      void speechSynthesis.playMessage(messageId);
    },
    [cancelCapture, isSpeechRecording, speechCommittedPrefix, speechSynthesis.playMessage],
  );

  const speechController = {
    speechCapabilities,
    microphonePermission,
    speechRecognitionState,
    speechError,
    onPressStart: handleSpeechStart,
    onCommit: commitCapture,
    onCancel: cancelCapture,
  };

  // Close source panel when there's no active session
  useEffect(() => {
    if (!routeSessionId && sourcePanelOpen) {
      closeSourcePanel();
    }
  }, [routeSessionId, sourcePanelOpen, closeSourcePanel]);

  // Scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll during streaming (interval-based instead of per-token)
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    let cancelled = false;
    void detectSpeechCapabilities().then((caps) => {
      if (!cancelled) {
        setSpeechCapabilities({ stt: caps.stt, tts: caps.tts });
        if (caps.microphonePermission !== 'unsupported') {
          useChatStore.getState().setMicrophonePermission(caps.microphonePermission);
        }
      }
    });
    return () => { cancelled = true; };
  }, [setSpeechCapabilities]);

  useEffect(() => {
    const handleWindowBlur = () => {
      if (isSpeechListening) {
        cancelCapture();
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [cancelCapture, isSpeechListening]);

  useEffect(() => {
    if (previousRouteSessionIdRef.current !== routeSessionId) {
      cancelRecordingIfActive();
      cleanupSpeechSynthesis();
      previousRouteSessionIdRef.current = routeSessionId;
    }
  }, [cancelRecordingIfActive, cleanupSpeechSynthesis, routeSessionId]);

  useEffect(() => {
    if (isSpeechRecording && (speechPlaybackState === 'starting' || speechPlaybackState === 'playing')) {
      cancelCapture();
      setInput(speechCommittedPrefix);
    }
  }, [cancelCapture, isSpeechRecording, speechCommittedPrefix, speechPlaybackState]);

  useEffect(() => () => {
    cleanupSpeechRecognition();
    cleanupSpeechSynthesis();
  }, [cleanupSpeechRecognition, cleanupSpeechSynthesis]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const content = input.trim();
    setInput('');
    void sendMessage({ question: content, sessionId: routeSessionId });
  }, [input, isStreaming, sendMessage, routeSessionId]);

  const handleStop = () => { stop(); };

  const handleNewChat = () => {
    cancelRecordingIfActive();
    abort();
    navigate(`/projects/${projectId}/chat`);
  };

  const handleSelectSession = (sid: string) => {
    if (sid === routeSessionId) return;
    cancelRecordingIfActive();
    abort();
    navigate(`/projects/${projectId}/chat/${sid}`);
  };

  const handleDeleteSession = (sid: string) => {
    deleteSessionMutation.mutate(sid, {
      onSuccess: () => {
        if (routeSessionId === sid) {
          cancelRecordingIfActive();
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

  const { prompts: suggestedPrompts } = useSuggestedPrompts(projectId);
  // Mount indexing status so prompt cache invalidation fires when indexing completes
  useIndexingStatus(projectId);

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
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectSession(session.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                  }

                  event.preventDefault();
                  handleSelectSession(session.id);
                }}
                className={cn(
                  'group w-full flex items-center text-left px-2.5 py-2 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  routeSessionId === session.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="truncate flex-1 min-w-0">{session.title}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-opacity shrink-0 ml-1"
                  onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                  aria-label={`Delete chat session ${session.title}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
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
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  onStopStreaming={handleStop}
                  isStreaming={isStreaming}
                  placeholder="Ask a question to start a new chat..."
                  speechController={speechController}
                />
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
                          onClick={() => { setInput(prompt); }}
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
                      initial={msg.id === streamingMessageId ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {msg.role === 'user' ? (
                        <UserMessage message={msg} />
                      ) : (
                        <AssistantMessage
                          message={msg}
                          isLastAssistant={idx === lastAssistantIdx}
                          onRetry={idx === lastAssistantIdx ? retry : undefined}
                          showSpeech={speechCapabilities.tts === 'available'}
                          speechDisabled={isStreaming}
                          isSpeaking={
                            activePlaybackMessageId === msg.id &&
                            speechPlaybackState === 'playing'
                          }
                          isLoadingSpeech={
                            activePlaybackMessageId === msg.id &&
                            speechPlaybackState === 'starting'
                          }
                          onToggleSpeech={handleToggleSpeech}
                        />
                      )}
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
              <div className="max-w-[800px] mx-auto">
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  onStopStreaming={handleStop}
                  isStreaming={isStreaming}
                  placeholder="Ask a question about your documents..."
                  speechController={speechController}
                />
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
