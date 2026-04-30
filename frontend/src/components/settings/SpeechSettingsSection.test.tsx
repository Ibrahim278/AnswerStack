import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/queryClient';
import { SpeechSettingsSection } from './SpeechSettingsSection';

// cmdk (Command palette) requires ResizeObserver and scrollIntoView
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

vi.mock('@/api/speech', () => ({
  getTTSProviders: vi.fn(),
  getVoices: vi.fn(),
}));

import { getTTSProviders, getVoices } from '@/api/speech';

const mockedGetProviders = vi.mocked(getTTSProviders);
const mockedGetVoices = vi.mocked(getVoices);

function renderSection(overrides: {
  tts_provider?: string;
  tts_voice_id?: string;
  update?: (key: string, value: unknown) => void;
} = {}) {
  const queryClient = createTestQueryClient();
  const update = overrides.update ?? vi.fn();
  const localConfig = {
    tts_provider: overrides.tts_provider ?? '',
    tts_voice_id: overrides.tts_voice_id ?? '',
  };

  const result = render(
    <QueryClientProvider client={queryClient}>
      <SpeechSettingsSection localConfig={localConfig} update={update} />
    </QueryClientProvider>,
  );

  return { ...result, update, queryClient };
}

/** Get the voice combobox (the Popover trigger Button with role="combobox"). */
function getVoiceCombobox() {
  // The voice combobox is inside a div whose sibling label says "Voice"
  const voiceLabel = screen.getByText('Voice');
  const voiceSection = voiceLabel.closest('.space-y-1\\.5') ?? voiceLabel.parentElement!;
  return within(voiceSection).getByRole('combobox');
}

const defaultProviders = {
  providers: [
    { id: 'piper', name: 'Piper TTS', available: true },
    { id: 'kokoro', name: 'Kokoro TTS', available: true },
    { id: 'elevenlabs', name: 'ElevenLabs TTS', available: false, reason: 'ELEVENLABS_API_KEY not configured' },
  ],
  active: 'Piper TTS',
};

const defaultVoices = {
  voices: [
    { voice_id: 'af_bella', name: 'Bella', labels: null },
    { voice_id: 'af_sky', name: 'Sky', labels: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SpeechSettingsSection', () => {
  it('renders the TTS Provider label', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    renderSection();

    expect(screen.getByText('TTS Provider')).toBeInTheDocument();
  });

  it('shows provider dropdown with selected provider name', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    renderSection({ tts_provider: 'piper' });

    await waitFor(() => {
      expect(screen.getByText('Piper TTS')).toBeInTheDocument();
    });
  });

  it('shows "None (disabled)" when tts_provider is empty', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);

    renderSection({ tts_provider: '' });

    await waitFor(() => {
      expect(screen.getByText('None (disabled)')).toBeInTheDocument();
    });
  });

  it('does not show voice selector when provider is none', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);

    renderSection({ tts_provider: '' });

    await waitFor(() => {
      expect(screen.getByText('None (disabled)')).toBeInTheDocument();
    });

    expect(screen.queryByText('Voice')).not.toBeInTheDocument();
  });

  it('shows voice selector with "Provider default" when a provider is selected', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    renderSection({ tts_provider: 'piper' });

    await waitFor(() => {
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    expect(screen.getByText('Provider default')).toBeInTheDocument();
  });

  it('shows selected voice name when tts_voice_id matches', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    renderSection({ tts_provider: 'kokoro', tts_voice_id: 'af_sky' });

    await waitFor(() => {
      expect(screen.getByText('Sky')).toBeInTheDocument();
    });
  });

  it('shows voice_id as fallback when it does not match any voice', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue({
      voices: [{ voice_id: 'v1', name: 'George', labels: null }],
    });

    renderSection({ tts_provider: 'elevenlabs', tts_voice_id: 'unknown-id' });

    await waitFor(() => {
      expect(screen.getByText('unknown-id')).toBeInTheDocument();
    });
  });

  it('calls update with voice_id when a voice is selected', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    const { update } = renderSection({ tts_provider: 'piper' });

    await waitFor(() => {
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    const voiceBtn = getVoiceCombobox();
    fireEvent.click(voiceBtn);

    await waitFor(() => {
      expect(screen.getByText('Bella')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Bella'));

    expect(update).toHaveBeenCalledWith('tts_voice_id', 'af_bella');
  });

  it('calls update with empty string when "Provider default" is selected from voice picker', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    const { update } = renderSection({ tts_provider: 'piper', tts_voice_id: 'af_bella' });

    await waitFor(() => {
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    const voiceBtn = getVoiceCombobox();
    fireEvent.click(voiceBtn);

    // Inside the dropdown, there's a "Provider default" CommandItem
    await waitFor(() => {
      // The dropdown is now open — find the Provider default option in the list
      const listItems = screen.getAllByText('Provider default');
      // There may be one on the button and one in the dropdown
      const dropdownItem = listItems.find((el) => el.closest('[cmdk-item]'));
      expect(dropdownItem).toBeTruthy();
      fireEvent.click(dropdownItem!);
    });

    expect(update).toHaveBeenCalledWith('tts_voice_id', '');
  });

  it('shows error when voice list fails to load', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockRejectedValue(new Error('Network error'));

    renderSection({ tts_provider: 'piper' });

    await waitFor(() => {
      expect(screen.getByText('Could not load voice list. Try refreshing.')).toBeInTheDocument();
    });
  });

  it('shows refresh button for voice list', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue(defaultVoices);

    renderSection({ tts_provider: 'piper' });

    await waitFor(() => {
      expect(screen.getByLabelText('Refresh voice list')).toBeInTheDocument();
    });
  });

  it('shows voice labels when available', async () => {
    mockedGetProviders.mockResolvedValue(defaultProviders);
    mockedGetVoices.mockResolvedValue({
      voices: [
        {
          voice_id: 'v1',
          name: 'George',
          labels: { accent: 'british', gender: 'male' },
        },
      ],
    });

    renderSection({ tts_provider: 'elevenlabs' });

    await waitFor(() => {
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    const voiceBtn = getVoiceCombobox();
    fireEvent.click(voiceBtn);

    await waitFor(() => {
      expect(screen.getByText('british, male')).toBeInTheDocument();
    });
  });

  it('shows error when providers fail to load', async () => {
    mockedGetProviders.mockRejectedValue(new Error('Server down'));

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('Could not load provider list.')).toBeInTheDocument();
    });
  });
});
