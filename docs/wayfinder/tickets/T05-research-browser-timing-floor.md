# T05 — Research: browser sub-frame timing — what APIs exist and what's the practical floor?

## Type
research (AFK)

## Question

The map's destination re-opens the "not reducible" deltas. The biggest one is input-to-judgement latency: browsers quantize to `requestAnimationFrame` (vsync), so input events delivered between frames don't get processed until the next frame. Lazer (native) reads input on its own thread with sub-millisecond timing.

What is the *actual* practical floor for input-to-judgement latency in a modern browser (2026), and which APIs could narrow it? This research feeds the Track C optimization ticket (T07) and the WebGPU/AudioWorklet/OffscreenCanvas tickets (T08/T10).

### Specific questions to answer (cited)

1. **Pointer Events timing**: do `pointerdown`/`pointermove` events carry a high-resolution timestamp (`event.timeStamp`)? Is it `performance.now()`-aligned? What's the resolution after the PrivacyReducedTiming spec (coarse vs high resolution)? Cite the Pointer Events spec + Chromium/Gecko/WebKit current behavior.
2. **`performance.now()` resolution**: what's the current resolution in each major browser (Chrome, Edge, Firefox, Safari) after privacy reduction (typically 100μs but check)? Does it vary by context (window vs worker vs worklet)?
3. **RAF + vsync**: confirm `requestAnimationFrame` is vsync-quantized. Is there *any* way to get a callback between vsyncs? `setTimeout(0)` / `MessageChannel` postMessage — do they fire intra-frame or only at the next task queue drain? What's the measured jitter?
4. **Input delivery path**: when the user clicks, what's the browser's path from OS event → JS event handler? Does it go through the compositor (one frame) or directly to the main thread? Cite Chromium input pipeline docs if available.
5. **WebGPU + input**: does WebGPU's `queue.onSubmittedWorkDone` or any WebGPU callback give sub-frame timing? Unlikely, but confirm. Does WebGPU render *during* the RAF callback or in a separate pass?
6. **AudioWorklet clock**: an `AudioWorkletProcessor.process()` callback runs on the audio thread at the audio sample rate (e.g. 48kHz → every ~0.02ms). Can it timestamp input events more precisely than the main thread? Cite Web Audio API spec. What's the practical jitter vs `AudioContext.currentTime`?
7. **Pointer Event prediction**: the existing `?legacyinput=0` path predicts the cursor position. Does the browser expose a native prediction API (`pointercursor` predictor, `getPredictedEvents`)? Cite.
8. **OffscreenCanvas + worker input**: if the render loop runs in a worker (T08), how does input reach it? `postMessage` from the main thread adds a hop — does this *add* latency or *remove* it (worker doesn't share main-thread task queue)? Cite.

### Acceptance

- `docs/wayfinder/research/browser-timing-floor.md` exists, cited, covering all 8 points.
- A table of "API → resolution → browser support → practical jitter" for each timing source.
- A conclusion: "the practical floor for input-to-judgement latency in a browser is X ms P50 / Y ms P95, and here's how to measure it" — this feeds T07's probe.
- Any API that could narrow the floor spawns a follow-up ticket (graduated from this research).

## Blocks

T07 (latency probe + critical-path optimization needs the floor), T08 (WebGPU/OffscreenCanvas decision needs the timing research), T10 (AudioWorklet decision needs #6)

## Blocked by

(none — pure research, parallel with T01/T02)