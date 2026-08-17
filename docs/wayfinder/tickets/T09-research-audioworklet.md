# T09 — AudioWorklet tight-clock: research + prototype decision

## Type
research (AFK) → graduates a prototype or task ticket

## Question

The map's destination attacks the "audio clock resampling" delta currently classified "not reducible." Howler (the current audio system per Phase 4) uses the main-thread `AudioContext.currentTime`, which is resampled vs. the audio thread. Lazer (native) reads audio time on the audio thread with sample-accurate timing.

`AudioWorkletProcessor.process()` runs on the audio thread at the sample rate (e.g. 48kHz). It can read `currentTime` with sample-accurate timing and `postMessage` it to the main thread. The question: does this give a measurably tighter clock than Howler's `currentTime`, and is the win worth the implementation cost (writing a custom AudioWorklet, bridging the clock back to the game loop, handling Safari's partial AudioWorklet support)?

This ticket is research-first; the decision (prototype vs. skip) graduates a follow-up ticket. Do NOT prototype in this ticket.

### Research questions (cited)

1. **Howler's `currentTime`**: how does Howler v2.2.4 expose `currentTime`? Is it the raw `AudioContext.currentTime` (resampled) or something Howler computes? Cite Howler source + issues.
2. **AudioWorklet clock resolution**: `AudioWorkletProcessor.process()` runs at the sample rate. What's the practical resolution of `currentTime` inside a worklet (sample-accurate, or quantized to the render quantum ~128 samples / ~2.67ms at 48kHz)? Cite Web Audio spec + Chromium/WebKit implementation.
3. **`postMessage` jitter**: when the worklet `postMessage`s the current time to the main thread, what's the jitter? Does it arrive intra-frame or only at the next task queue drain? Cite T05 #3 (RAF + task queue) + Web Audio spec.
4. **Safari AudioWorklet support**: as of 2026, does Safari stable support AudioWorklet? What's the fallback for Safari (ScriptProcessorNode — deprecated, runs on main thread, no win)? Cite caniuse + WebKit release notes.
5. **Howler + AudioWorklet coexistence**: Howler owns the `AudioContext`. Can an AudioWorklet share that context (run on Howler's context), or does it need a parallel one? Cite Howler source + Web Audio spec. (This is the "AudioWorklet + Howler coexistence" fog item — graduate the answer here.)
6. **Cost/benefit**: implementation cost = write a custom `clock-worklet.js`, bridge the clock to `osu-audio.js`, handle the Safari fallback, A/B test against Howler's clock. Expected win = ? ms (from the research). Is the win measurable above RAF jitter, or does it disappear?

### Decision (graduates a follow-up ticket if "yes")

Based on the research, one of:
- **Prototype AudioWorklet clock** — write the worklet, bridge to `osu-audio.js`, A/B measure vs Howler. Graduates a prototype ticket.
- **Skip** — research shows the win is below RAF jitter (the audio clock is already tighter than the RAF-quantized render path, so a tighter audio clock doesn't help input-to-judgement latency). Document why in `docs/lazer-feel-deltas.md` and close.

### Acceptance

- `docs/wayfinder/research/audioworklet-clock-research.md` exists, cited, covering all 6 research questions.
- A decision section naming prototype vs. skip with reasoning.
- If skipping: `docs/lazer-feel-deltas.md` updated with the "AudioWorklet clock: considered, not pursued because X" entry.
- If prototyping: a new prototype ticket graduated from this one.

## Blocks

T12 (final validation), T13 (the deltas doc can't be finalized until this decision lands)

## Blocked by

T02 (#13 AudioWorklet-vs-Howler feeds in), T05 (#6 AudioWorklet clock feeds in), T07 (reducible baseline before attacking not-reducible)