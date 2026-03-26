import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SourcePanel } from './SourcePanel';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessageResponse } from '../../types';
import { theme } from '../../theme';

describe('SourcePanel', () => {
  afterEach(() => {
    useChatStore.setState({
      sourcePanelOpen: false,
      activeSourceMsgId: null,
      streamingMessageId: null,
      currentSources: [],
    });
  });

  it('preserves source order so citation numbers match the streamed answer', () => {
    const message: ChatMessageResponse = {
      id: 'message-1',
      session_id: 'session-1',
      role: 'assistant',
      content: 'Answer with [Source 1] and [Source 2].',
      sources_json: [
        {
          document_name: 'first-source.md',
          chunk_text: 'first excerpt',
          page_number: null,
          relevance_score: 0.1,
        },
        {
          document_name: 'second-source.md',
          chunk_text: 'second excerpt',
          page_number: null,
          relevance_score: 0.9,
        },
      ],
      created_at: new Date().toISOString(),
    };

    useChatStore.setState({
      sourcePanelOpen: true,
      activeSourceMsgId: 'message-1',
      streamingMessageId: null,
      currentSources: [],
    });

    render(
      <MantineProvider theme={theme}>
        <SourcePanel messages={[message]} />
      </MantineProvider>,
    );

    const sourceLabels = screen.getAllByText(/Source \d/).map((node) => node.textContent);
    const documentNames = screen.getAllByText(/source\.md$/).map((node) => node.textContent);

    expect(sourceLabels).toEqual(['Source 1', 'Source 2']);
    expect(documentNames).toEqual(['first-source.md', 'second-source.md']);
  });
});
