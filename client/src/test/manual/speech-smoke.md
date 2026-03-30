Status: completed
Browser: Chromium
Date: 2026-03-30
Notes: A Chromium browser spike confirmed that `SpeechRecognition` and `speechSynthesis` are exposed and that `speechSynthesis.getVoices()` can start empty. The interaction cases below are the audit checklist to rerun against the Phase 8 UI as soon as the composer and message controls land.

# Speech Smoke Checklist

## Microphone Prompt

- [ ] Accept first-use microphone prompt:
  1. Open the chat surface in Chromium with a fresh microphone permission state.
  2. Press and hold the microphone control.
  3. Accept the native microphone prompt.
  4. Confirm the inline UI leaves `arming`, transitions to active listening, and interim transcript text appears without losing the original composer text.

- [ ] Deny first-use microphone prompt:
  1. Reset microphone permission to prompt.
  2. Press and hold the microphone control.
  3. Deny the native prompt.
  4. Confirm the composer returns to its pre-recording text and an inline recovery notice explains how to re-enable microphone access.

- [ ] Ignore first-use microphone prompt for at least 4 seconds:
  1. Reset microphone permission to prompt.
  2. Press and hold the microphone control.
  3. Leave the native prompt unanswered for 4 seconds or longer.
  4. Confirm the UI surfaces a stable pending notice with retry/cancel guidance instead of remaining stuck.

## Push-To-Talk Cancel/Commit

- [ ] Press-and-hold release commits transcript:
  1. Start with existing composer text already present.
  2. Press and hold the microphone control, speak a short sentence, then release while still over the control.
  3. Confirm the final transcript is appended to the original composer text and remains editable without auto-sending.

- [ ] Drag-away release cancels transcript:
  1. Start a recording with existing composer text present.
  2. Drag the pointer away from the microphone control before releasing.
  3. Confirm recording cancels, the original composer text is restored exactly, and no interim transcript remains visible.

- [ ] `Escape` cancels an active recording:
  1. Start recording from the composer.
  2. Press `Escape` before release.
  3. Confirm recording stops immediately, the composer restores the committed prefix text, and the microphone control returns to idle.

## Voice Inventory

- [ ] Voice list initially empty, then populated later:
  1. Load the chat page in Chromium and inspect the browser voice inventory on first paint.
  2. If `speechSynthesis.getVoices()` is empty, wait for the `voiceschanged` event.
  3. Confirm the app refreshes its voice count when voices appear later without requiring a reload.

## Playback Exclusivity

- [ ] Playback switches from one assistant message to another without overlap:
  1. Start playback on assistant message A.
  2. While A is still speaking, trigger playback on assistant message B.
  3. Confirm A stops immediately, B becomes the only active playback owner, and playback can still be stopped cleanly.
