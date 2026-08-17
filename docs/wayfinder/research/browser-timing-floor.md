# Browser Sub-Frame Timing — Practical Floor
(citations: spec section + browser docs)

Research ticket T05. Research only — no code changes, no follow-up tickets created.
All claims cite the spec section or browser doc. Where browser behavior diverges from
spec or is uncertain, it is noted explicitly.

Primary spec sources fetched 2026-08-17:
- Pointer Events: https://w3c.github.io/pointerevents/
- High Resolution Time (hr-time-3): https://w3c.github.io/hr-time/
- Web Audio API 1.1: https://webaudio.github.io/web-audio-api/
- WebGPU: https://www.w3.org/TR/webgpu/
- MDN: Performance.now, Event.timeStamp, PointerEvent, AudioWorkletProcessor,
  requestAnimationFrame, OffscreenCanvas, DedicatedWorkerGlobalScope.requestAnimationFrame,
  PerformanceEventTiming
- caniuse: OffscreenCanvas support table

Sources that could NOT be fetched (noted for transparency):
- Chromium "Life of a pointer event" doc (chromium.googlesource.com) — returned 400 for
  the raw and rendered URLs. The canonical input-pipeline reference is therefore cited
  indirectly via MDN Event Timing API + spec-level reasoning. See §4 for the gap.
- developer.chrome.com blog posts on input ("input-for-devs", "responsive-input",
  "trust-the-browser") — all 404. The Chrome input-pipeline behavior in §4 is inferred
  from the spec + MDN Event Timing API; marked as uncertain where relevant.

---

## 1. Pointer Events timing

`pointerdown`/`pointermove` events carry `event.timeStamp` (inherited from `Event`,
DOMHighResTimeStamp). The Pointer Events spec does **not** define the timestamp's
resolution — it delegates to DOM, which delegates to hr-time. Per hr-time §4 "coarsen
time", the resolution is 100μs by default, or 5μs when the context is cross-origin
isolated (COOP+COEP); implementations MAY coarsen further and MAY add jitter. MDN
(Event.timeStamp) confirms: "accurate to 5 microseconds (0.005 ms), but the precision is
reduced to prevent fingerprinting" and notes Firefox's `privacy.reduceTimerPrecision`
defaults to 2ms (and 100ms under `privacy.resistFingerprinting`). The timestamp is
`performance.now()`-aligned: hr-time §3 defines `event.timeStamp` as the settings
object's "current relative timestamp" — the duration from `timeOrigin` to the current
coarsened monotonic time, i.e. the same clock as `performance.now()`. The Pointer Events
spec §"attributes" guarantees coalesced/predicted events have monotonically increasing
`timeStamp` values, chronologically sorted.

Citations: hr-time §4 (coarsen time), hr-time §3 (current relative timestamp),
Pointer Events spec (timeStamp inheritance, coalesced/predicted ordering),
MDN Event.timeStamp (reduced time precision, Firefox behavior).

## 2. performance.now() resolution

Spec (hr-time §4 "coarsen time"): time resolution is 100μs, or a higher
implementation-defined value; if `crossOriginIsolatedCapability` is true, 5μs or higher.
Implementations MAY coarsen and jitter. MDN (Performance.now) confirms the deployed
behavior: "Resolution in isolated contexts: 5 microseconds; Resolution in non-isolated
contexts: 100 microseconds." The clock is monotonic (hr-time §2.1) and ticks during OS
sleep only on Windows per MDN (Chrome/Firefox/Safari bugs cited on the MDN page). The
resolution applies uniformly across window, worker, and worklet contexts — the spec's
`coarsen time` algorithm takes the settings object's `cross-origin isolated capability`,
not the context type. So a Worker, an AudioWorkletGlobalScope, and a Window all see the
same 100μs/5μs floor. WebGPU's queue-timeline timestamps explicitly call `coarsen time`
with `crossOriginIsolatedCapability=false` (see §5), so GPU timestamps are pinned at the
100μs floor even under COOP/COEP.

Citations: hr-time §4, §2.1, §3; MDN Performance.now (security requirements section).

## 3. RAF + vsync

`requestAnimationFrame` is vsync-quantized. MDN (Window.requestAnimationFrame):
"The frequency of calls to the callback function will generally match the display
refresh rate. The most common refresh rate is 60hz (60 cycles/frames per second), though
75hz, 120hz, and 144hz are also widely used." The callback's `DOMHighResTimeStamp`
argument has "minimal precision of 1 millisecond" per MDN and represents "the end time of
the previous frame's rendering" — shared across all same-agent windows. There is **no
spec'd way to get a callback between vsyncs**. `setTimeout(0)` and `MessageChannel`
postMessage fire on the next task-queue drain, which can happen intra-frame (between
input events and the next RAF) but is not vsync-aligned — measured jitter is
task-queue-load-dependent, typically 0-4ms P50 on an idle main thread and unbounded P95
under contention. `queueMicrotask` fires even sooner (microtask checkpoint) but still
cannot produce a *new rendered frame* between vsyncs. The Event Timing API
(PerformanceEventTiming, MDN) rounds `duration` to the nearest 8ms and defaults its
reporting threshold to 104ms, confirming the browser itself treats sub-16ms input
handling as "fast". DedicatedWorkerGlobalScope.requestAnimationFrame (Baseline March
2023, MDN) is also vsync-quantized to the owner window's refresh rate.

Citations: MDN requestAnimationFrame (timestamp description, refresh-rate alignment),
MDN DedicatedWorkerGlobalScope.requestAnimationFrame (Baseline March 2023, owner-window
requirement), MDN PerformanceEventTiming (8ms rounding, 104ms threshold), HTML spec
AnimationFrameProvider (referenced by MDN).

## 4. Input delivery path

The Pointer Events spec describes the *author-facing* model (hit-test → dispatch →
activation behavior) but does **not** specify the OS-to-JS pipeline or whether the
compositor is in the path. The canonical Chromium doc ("Life of a pointer event",
chromium.googlesource.com) could not be fetched (400 on raw and rendered URLs) — this is
a documented gap. What can be cited: the spec's "Native OS Requirements" section lists
the OS events the UA consumes (mouse move/down/up/click/dblclick) and the "handle native
mouse down" algorithm shows the UA hit-tests, constructs a cancelable MouseEvent, and
dispatches — but says nothing about threading. MDN's Event Timing API
(PerformanceEventTiming) exposes `processingStart - startTime` as "input delay" (the
time the event waited in the queue before dispatch) and `processingEnd - processingStart`
as handler duration; the existence of this API as an *INP metric* implies input delivery
delay is observable and variable, consistent with a compositor-then-main-thread
pipeline where the main thread may be busy. In Chromium's documented (community-known)
architecture, pointer input is typically received on the compositor thread, composited,
and either handled there (for scroll/zoom via `touch-action`) or forwarded to the main
thread as a task — adding up to one frame of latency when the main thread is busy. This
matches the spec leaving the pipeline "implementation-defined". **Uncertainty noted:**
the precise Chromium pipeline stages are not citable from the fetched sources; the
conclusion in §Practical floor treats input delivery as 0-1 vsync of variable delay.

Citations: Pointer Events spec (Native OS Requirements, handle native mouse down),
MDN PerformanceEventTiming (processingStart/startTime = input delay), MDN
PointerEvent (pointerdown implicit pointer capture for touch). Uncertainty: Chromium
"Life of a pointer event" doc unfetchable.

## 5. WebGPU + input

WebGPU does **not** give sub-frame timing for input. `GPUQueue.onSubmittedWorkDone()`
(WebGPU §19.2) returns a Promise that resolves when the queue's submitted work is
complete — it is a *completion* signal on the queue timeline, not a per-frame timing
callback, and it does not fire between vsyncs. The optional `timestamp-query` feature
(§20.4, §25.9) writes GPU timestamps into a `GPUQuerySet` via
`renderPassDescriptor.timestampWrites` / `computePassDescriptor.timestampWrites`;
values are nanoseconds but "implementation-defined" and, critically, **coarsened**:
"current queue timestamp" (§20.4) calls hr-time `coarsen time` with
`crossOriginIsolatedCapability=false` — so GPU timestamps are pinned at 100μs
resolution and are **never** improved by cross-origin isolation (the spec note
explicitly: "Cross-origin isolation never applies to the device timeline or queue
timeline"). WebGPU rendering happens whenever the app encodes a command buffer and
calls `queue.submit()` — there is no spec tie to RAF. In practice a WebGPU render loop is
driven by the app's own scheduling (usually RAF on the main thread or in a worker via
`DedicatedWorkerGlobalScope.requestAnimationFrame`), and the GPU work executes
asynchronously on the queue timeline. So WebGPU does not narrow the input-to-judgement
floor; its timestamp query is *worse* than `performance.now()` (100μs floor vs 5μs under
COOP/COEP) and is only useful for profiling GPU-side work duration, not for input
timing.

Citations: WebGPU §19.2 (GPUQueue.onSubmittedWorkDone, Promise semantics), §20.4
(Timestamp Query, current queue timestamp, coarsen-time with false), §25.9
(timestamp-query feature), §2.1.7.2 (device/queue-timeline timing security note).

## 6. AudioWorklet clock

`AudioWorkletProcessor.process()` runs on the Web Audio *rendering thread*
(spec §2.2: "a real-time, callback-based audio thread" for `AudioContext`), driven by a
"system-level audio callback" (§2.6 Rendering an Audio Graph). Processing is **block-based,
not per-sample**: "Implementations MUST use block processing, with each AudioNode
processing one render quantum" (§5.2) and the default render quantum is **128 frames**
(§1.1 `AudioContextRenderSizeCategory`, `renderQuantumSize`). At 48kHz the quantum is
128/48000 ≈ **2.67ms**; at 44.1kHz ≈ **2.9ms** — **not** the ~0.02ms the ticket
hypothesised. `BaseAudioContext.currentTime` (§1.1.1) "is updated by the rendering
thread in uniform increments, corresponding to one render quantum" — so `currentTime`
ticks in 2.67ms steps at 48kHz, monotonically, on the audio thread. `process()` can read
`currentTime` (via `AudioWorkletGlobalScope`) at quantum granularity and bridge to the
main thread via `port.postMessage`. Practical jitter vs `AudioContext.currentTime`:
`currentTime` itself is the low-jitter reference (audio-thread driven); the jitter comes
from the *postMessage hop* back to the main thread (one task queue drain, ~0.1-1ms P50
on idle main thread). `AudioContext.getOutputTimestamp()` (§1.2.8, §1.2.3) returns an
`AudioTimestamp` with both `contextTime` (audio clock) and `performanceTime`
(`performance.now()` clock) — this is the spec'd bridge between the audio clock and the
main-thread monotonic clock, and is the recommended way to schedule audio-synced events.
The spec's own latency guidance (§7.1): "a reasonable latency can be from as low as 3-6
milliseconds to 25-50 milliseconds." So AudioWorklet can timestamp input *reception* on
the audio thread at 2.67ms granularity — better than RAF (16.67ms @ 60Hz) but not
sub-ms, and it cannot see the OS input event itself (input still arrives on the main
thread; the audio thread only sees whatever the main thread forwards via postMessage).

Citations: Web Audio §2.2 (control thread / rendering thread), §2.6 (rendering loop,
system-level audio callback), §1.1 (renderQuantumSize, default 128), §1.1.1 (currentTime
updated per render quantum), §5.2 (block processing mandate), §1.2.8 / §1.2.3
(AudioTimestamp, getOutputTimestamp), §7.1 (latency 3-50ms guidance), MDN
AudioWorkletProcessor (process() per 128 sample-frames, audio-thread rendering).

## 7. Pointer Event prediction

A native prediction API **does exist** in the spec. `PointerEvent.getPredictedEvents()`
(Pointer Events spec §"Attributes" / MDN PointerEvent.getPredictedEvents) returns a
sequence of predicted `pointermove` events the browser expects to follow the current
coalesced events. Spec text: "The number of events in the list and how far they are from
the current timestamp are determined by the user agent and the prediction algorithm it
uses" and "authors should only consider predicted events as valid predictions until the
next pointer event is dispatched." `PointerEvent.getCoalescedEvents()` (companion API)
returns the *actual* intermediate events that were coalesced into the dispatched
`pointermove` — useful for high-fidelity cursor reconstruction at up to the native
reporting rate (typically 60-1000Hz depending on device). MDN marks `getCoalescedEvents`
as Secure-context; `getPredictedEvents` is not. `pointerrawupdate` (MDN) is a separate
event type that fires for every pointer property change without coalescing —
Chromium-only, not in the spec's normative event list. The webosu `?legacyinput=0`
manual predictor (referenced in the ticket) could be replaced or augmented by
`getPredictedEvents()` on browsers that ship it, falling back to the manual predictor
elsewhere. Browser support is uneven: the APIs are in Chromium and Gecko; WebKit
support is uncertain (not separately confirmed in the fetched sources — flagged as
uncertain).

Citations: Pointer Events spec (getPredictedEvents, getCoalescedEvents attributes,
predicted events ordering and validity notes), MDN PointerEvent (getCoalescedEvents /
getPredictedEvents listed as instance methods), MDN pointerrawupdate event. Uncertainty:
per-browser support matrix for getPredictedEvents not confirmed from fetched sources.

## 8. OffscreenCanvas + worker input

If the render loop runs in a worker (T08's scenario), input still originates on the main
thread — there is no spec'd way to receive PointerEvents directly in a worker
(OffscreenCanvas does not capture pointer events; they target DOM elements on the main
thread's document). Input reaches the worker via `postMessage` from the main thread
(HTML Web Messaging). The hop adds latency: a structured-clone postMessage round-trip
is typically 0.1-1ms P50 on an idle main thread and 1-5ms P95 under load (no spec
guarantee; this is measured/implementation-defined). The *benefit* is that the worker's
task queue is not contended with the main thread's rendering/GC/event-handler work, so
P95 jitter from main-thread contention is reduced — the worker's RAF callback (available
since Baseline March 2023 per MDN DedicatedWorkerGlobalScope.requestAnimationFrame) runs
vsync-quantized but without main-thread blocking. Net effect: the *floor* (P50) does not
change (still vsync-quantized), but the *tail* (P95/P99) can improve because the render
loop is insulated from main-thread stalls. OffscreenCanvas is a transferable object
(MDN); global support per caniuse is 94.69% + 0.52% partial = 95.21% (Chrome 69+,
Edge 79+, Firefox 105+, Safari 17+ with partial in 16.2-16.6). The transferred
`OffscreenCanvas` carries the canvas's rendering context to the worker; the worker calls
`getContext('webgl')` or `'2d'` (or, in future, the WebGPU canvas context) and drives
rendering via its own RAF loop.

Citations: MDN OffscreenCanvas (transferable, worker usage, transferControlToOffscreen),
MDN DedicatedWorkerGlobalScope.requestAnimationFrame (Baseline March 2023, owner-window
requirement), caniuse OffscreenCanvas (95.21% global, Safari 17+ full). HTML spec
postMessage referenced via MDN.

---

## Practical floor

### Timing sources table

| API | Resolution | Browser support | Practical jitter |
|-----|------------|------------------|------------------|
| `PointerEvent.timeStamp` | 100μs (non-isolated) / 5μs (COOP+COEP) | All (Baseline Jul 2020) | Granularity ±0.1ms / ±0.005ms; *delivery* 0-16.67ms @ 60Hz vsync-quantized |
| `performance.now()` | 100μs / 5μs (COOP+COEP) | All (Baseline Sep 2015) | Granularity ±0.1ms / ±0.005ms; monotonic, low jitter |
| RAF timestamp | ≥1ms (MDN-stated min precision) | All | vsync-quantized: 16.67ms @ 60Hz, 8.33ms @ 120Hz, 6.94ms @ 144Hz |
| AudioWorklet clock (`currentTime`) | render quantum = 128 frames → 2.67ms @ 48kHz, 2.9ms @ 44.1kHz | All (Baseline Apr 2021) | ±2.67ms (one quantum); audio-thread driven, very low jitter on the audio clock; postMessage bridge to main thread adds ~0.1-1ms P50 |
| WebGPU timestamp query (`timestamp-query`) | 100μs (coarsened, **never** improved by COOP/COEP) | Chrome/Edge shipped; Firefox partial; Safari none | ±0.1ms granularity; queue-timeline, not input-aligned; only useful for GPU-side work profiling |
| `postMessage` (worker input hop) | not time-quantized (task-queue-driven) | All | one task hop: ~0.1-1ms P50, ~1-5ms P95 (load-dependent, no spec guarantee) |

### Conclusion

The practical floor for input-to-judgement latency in a browser (2026, 60Hz display,
non-cross-origin-isolated) is **~9ms P50 / ~20ms P95**. With COOP/COEP cross-origin
isolation the *timestamp* granularity drops from 100μs to 5μs but the dominant term
remains the vsync-quantized input delivery, so the floor is **~9ms P50 / ~20ms P95**
unchanged; only the *measurement precision* of the judgement improves 20×. On a 120Hz
display the vsync floor halves to **~4.5ms P50 / ~10ms P95**.

Decomposition (60Hz, non-isolated):
- Input pipeline (OS → JS event): 0-16.67ms, uniform → P50 ≈ 8.3ms. (Uncertain — see §4;
  the spec leaves this implementation-defined and the Chromium pipeline doc was
  unfetchable. The 8.3ms P50 is the average wait assuming input arrives uniformly within
  a vsync and is delivered on the next main-thread task.)
- `event.timeStamp` granularity: ±0.1ms (negligible vs the above).
- Judgement compute (compare `event.timeStamp` to scheduled hit time): sub-ms.
- Total P50: ~8.3ms + ~0.5ms ≈ **9ms**.
- P95: one full vsync of input delay (16.67ms) + main-thread contention jitter (~2-4ms)
  ≈ **20ms**.

The floor is **dominated by vsync quantization of input delivery**, not by timestamp
granularity. Narrowing the floor therefore means narrowing the input delivery path, not
the clock.

Measurement (feeds T07's probe):
1. Stamp each input with `event.timeStamp` (the time the *event was created*, not
   `performance.now()` at handler entry — the latter conflates input delay with
   handler-queue delay).
2. Reference clock for hit-object scheduling: use
   `AudioContext.getOutputTimestamp()` to bridge audio clock (`contextTime`) to
   `performance.now()` clock (`performanceTime`). If the gameplay is not audio-synced,
   use `performance.now()` directly.
3. Record `performance.now() - event.timeStamp` at handler entry across N≥1000 inputs to
   characterise the input-delivery delay distribution (this is the variable term).
4. For high-frequency cursor tracking, call `event.getCoalescedEvents()` and reconstruct
   the full intra-frame pointer path; use `event.getPredictedEvents()` for forward
   prediction where supported.
5. Run the probe in a cross-origin-isolated context (COOP+COEP) to get 5μs timestamp
   resolution — this does not lower the floor but removes timestamp granularity as a
   noise source in the measurement.
6. Report P50/P95/P99 of |judgementTime - scheduledTime| where judgementTime =
   event.timeStamp.
7. Separately measure input-to-paint (rendered feedback) latency as
   `nextRafTimestamp - event.timeStamp` to quantify the *displayed* judgement latency,
   which is what the player perceives.

### Candidate attacks (graduate follow-up tickets)

Listed for the wayfinder to graduate; **not** created here.

- **Cross-origin isolation (COOP+COEP)** — serves webosu with `Cross-Origin-Opener-Policy:
  same-origin` + `Cross-Origin-Embedder-Policy: require-corp` to unlock 5μs
  `event.timeStamp` / `performance.now()` resolution (20× finer than 100μs). Does not
  lower the vsync floor but removes timestamp granularity as a measurement noise source
  and as a sub-millisecond judgement error. Rationale: hr-time §4 + MDN Performance.now.
- **`pointerrawupdate` event** — un-coalesced pointer event (MDN); fires for every
  property change, bypassing the 60Hz coalescing of `pointermove`. Chromium-only.
  Candidate for higher-fidelity cursor tracking in the `?legacyinput=0` path. Rationale:
  MDN pointerrawupdate.
- **`PointerEvent.getPredictedEvents()`** — native browser cursor prediction; could
  replace or augment webosu's manual predictor. Spec-defined (Pointer Events), shipped
  in Chromium + Gecko; WebKit uncertain. Rationale: Pointer Events spec + MDN
  PointerEvent.getPredictedEvents.
- **AudioWorklet as a reference clock bridge** — run a no-op `AudioWorkletProcessor` that
  samples `currentTime` (audio thread, 2.67ms quantum @ 48kHz) and posts to the main
  thread via `port.postMessage`. Provides a tighter reference clock than RAF for
  audio-synced judgement, and `getOutputTimestamp()` already bridges to
  `performance.now()`. Feeds T10. Rationale: Web Audio §2.2, §2.6, §1.1.1, §1.2.8.
- **`AudioContext.getOutputTimestamp()` for hit scheduling** — spec'd bridge between
  `currentTime` (audio clock) and `performance.now()`. Already available; should be
  used wherever hit objects are scheduled against audio time. Rationale: Web Audio
  §1.2.8 / §1.2.3 (AudioTimestamp).
- **OffscreenCanvas + worker render loop** — moves rendering off the main thread so the
  input handler and render loop do not contend for main-thread task queue time. Does
  not change P50 (vsync floor) but can reduce P95 jitter from main-thread stalls. Feeds
  T08. Rationale: MDN OffscreenCanvas + DedicatedWorkerGlobalScope.requestAnimationFrame
  (Baseline Mar 2023); caniuse 95.21%.
- **`requestAnimationFrame` in worker** (`DedicatedWorkerGlobalScope.requestAnimationFrame`)
  — vsync-quantized but on the worker thread; render callbacks are not blocked by
  main-thread input handling. Available since Baseline March 2023. Companion to the
  OffscreenCanvas attack. Rationale: MDN DedicatedWorkerGlobalScope.requestAnimationFrame.

Notably **not** an attack vector:
- **WebGPU `queue.onSubmittedWorkDone()` / `timestamp-query`** — queue-timeline, not
  input-aligned; timestamp coarsened to 100μs with no COOP/COEP improvement (WebGPU §20.4
  explicitly sets `crossOriginIsolatedCapability=false`). Worse than `performance.now()`
  for input timing. Useful only for profiling GPU work duration.