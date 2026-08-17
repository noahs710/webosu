# AudioWorklet Tight-Clock Research (T09)
(citations: Web Audio spec + Howler source + browser docs)

Research ticket T09. Research only — no code changes, no follow-up tickets created.
All claims cite the spec section, browser doc, or source file/line. Where browser
behavior diverges from spec or is uncertain, it is noted explicitly.

Primary sources fetched 2026-08-17:
- Web Audio API 1.1 editor's draft: https://webaudio.github.io/web-audio-api/
- Howler v2.2.4 source: https://github.com/goldfire/howler.js (raw master `src/howler.core.js`)
- MDN AudioWorklet / AudioWorkletProcessor / AudioWorkletGlobalScope
- caniuse `audio-api.json` (the caniuse data file; there is no standalone
  `audioworklet.json` — AudioWorklet support is folded under the Web Audio API entry)
- webosu source: `src/game/sound.js`, `src/game/osu-audio.js`

Sources that could NOT be fetched (noted for transparency):
- **caniuse `audioworklet` standalone page** (`caniuse.com/audioworklet`): the page
  loads via client-side JS and the static HTML returned no support table. The caniuse
  GitHub data repo has no `audioworklet.json` feature file (404). Safari AudioWorklet
  support is therefore cited via MDN Browser Compatibility (Baseline "Widely available
  … since April 2021") + the caniuse `audio-api.json` Safari timeline (which shows
  full `y` support from Safari 14.1 onward, consistent with MDN's April-2021 Baseline
  date for AudioWorklet). WebKit release notes were not separately fetched; the MDN
  Baseline date is the citable anchor.
- **MDN `browser-compat-data` JSON for AudioWorklet**: the file
  `web/api/AudioWorklet.json` 404s on `raw.githubusercontent.com` and the GitHub
  contents API (the BCD schema stores it under a different path structure). The MDN
  page's "Baseline: Widely available since April 2021" statement is cited instead.

---

## Prior findings (from T02 + T05)

- **T02 (lazer-source-audit.md) point 13** found: Howler v2.2.4 reads
  `AudioContext.currentTime` on the main thread; an AudioWorkletProcessor clock
  would be "sample-accurate" with no cross-thread staleness; net practical win
  estimated at ~2.9 ms (one render quantum) of freshness. **That estimate used the
  wrong render-quantum value** — see the correction below.
- **T05 (browser-timing-floor.md) point 6** corrected the factual error in T09's
  ticket hypothesis: `AudioWorkletProcessor.process()` runs at the **128-frame
  render quantum** (~2.67 ms at 48 kHz, ~2.9 ms at 44.1 kHz), **NOT** at the sample
  rate (~0.02 ms). `currentTime` (§1.1.1) is "updated by the rendering thread in
  uniform increments, corresponding to one render quantum." So the AudioWorklet
  clock is **quantum-accurate (±2.67 ms @ 48 kHz)**, not sample-accurate. The
  ticket's "~0.02 ms resolution" premise is wrong.
- **T05 "Candidate attacks" #4 / #5** named two complementary approaches: (a) a
  no-op AudioWorklet that posts `currentTime` to the main thread, and (b)
  `AudioContext.getOutputTimestamp()` — the spec'd bridge between the audio clock
  (`contextTime`) and `performance.now()` (`performanceTime`). T05 recommended
  `getOutputTimestamp()` for hit scheduling.
- **CRITICAL new finding from the webosu source** (not in T02/T05): the game's
  song clock is **NOT Howler**. `src/game/sound.js` imports Howler solely for
  hitsounds (`GameSound` wraps `Howl` for short sfx) and exposes
  `window.actx = Howler.ctx` for the resume-on-gesture path. The **song playback
  clock** is `src/game/osu-audio.js`, which constructs its **own**
  `AudioContext` at `osu-audio.js:134` (`{ latencyHint: "interactive", sampleRate: 48000 }`),
  decodes the beatmap audio into an `AudioBuffer`, plays it via
  `AudioBufferSourceNode`, and tracks position in `_getPosition()` at
  `osu-audio.js:178-196`. **Howler's `currentTime`/`seek()` is only used for
  hitsound scheduling, not the gameplay clock.** This reframes questions 1 and 5
  considerably.

---

## 1. Howler's currentTime

Howler v2.2.4 does **not** compute its own audio clock — it exposes the raw
`AudioContext.currentTime` of its single global context (`Howler.ctx`, created
lazily via `setupAudioContext()`). The seek-position computation in
`Howl.prototype.seek()` (`src/howler.core.js` lines 1680-1683) is:

```js
if (self._webAudio) {
  var realTime = self.playing(id) ? Howler.ctx.currentTime - sound._playStart : 0;
  var rateSeek = sound._rateSeek ? sound._rateSeek - sound._seek : 0;
  return sound._seek + (rateSeek + realTime * Math.abs(sound._rate));
}
```

So `seek()` returns `baseSeek + (Howler.ctx.currentTime - playStart) * rate` — a
straight passthrough of `AudioContext.currentTime` minus the recorded play-start
timestamp, scaled by the playback rate. There is no smoothing, no interpolation,
no Howler-side resampling. `_playStart` is set to `Howler.ctx.currentTime` at the
moment `node.bufferSource.start(0, seek, duration)` is called (`howler.core.js`
line 864). `AudioContext.currentTime` (Web Audio §1.1.1) is "updated by the
rendering thread in uniform increments, corresponding to one render quantum" and
"MUST be read atomically on the control thread before being returned" — so a
main-thread read sees a value that is 0–1 quantum old (0–2.67 ms at 48 kHz). **Howler
adds no jitter of its own; the jitter is entirely the spec'd
`AudioContext.currentTime` quantum quantization + cross-thread staleness.**

**Relevance to webosu:** Howler's clock only governs hitsounds. The gameplay song
clock is `osu-audio.js`, which has the **same** raw-`currentTime` characteristic
(`osu-audio.js:181` reads `self.audio.currentTime`) but layers
`getOutputTimestamp()` on top (see §5). So "Howler's currentTime" as the thing an
AudioWorklet would replace is a misconception in the ticket — the thing to replace
would be `osu-audio.js`'s clock, and that clock already does better than raw
`currentTime`.

Citations: Howler `src/howler.core.js` (seek() lines 1680-1683, _playStart line
864, Howler.ctx init in setupAudioContext); Web Audio §1.1.1 (currentTime
attribute — render-quantum increments, atomic control-thread read).

## 2. AudioWorklet clock resolution

The ticket's hypothesis ("`process()` runs at the sample rate, ~0.02 ms resolution")
is **wrong**, corrected by T05. Per Web Audio §5.2 ("Implementations MUST use block
processing, with each AudioNode processing one render quantum") and §1.1 (default
`renderQuantumSize` = 128 frames), `process()` is called once per 128-sample block.
At 48 kHz that is 128/48000 ≈ **2.67 ms**; at 44.1 kHz ≈ 2.9 ms. Inside the
`AudioWorkletGlobalScope` (§1.32.3, MDN AudioWorkletGlobalScope), `currentTime` "is
equal to the currentTime property of the BaseAudioContext the worklet belongs to"
and `currentFrame` "is incremented by 128 (the size of a render quantum) after the
processing of each audio block." So the worklet sees the **same quantum-quantized
`currentTime`** the main thread sees — there is no finer-grained sample counter
exposed. The worklet's advantage is **not** resolution (it's 2.67 ms either way)
but **freshness/staleness**: the worklet reads `currentTime` on the same thread
that advances it, so it sees the value for the block currently being rendered,
whereas a main-thread read sees a value that is 0–1 quantum old. The maximum
freshness win is therefore **one render quantum (~2.67 ms @ 48 kHz)**, not the
~5.8 ms T02 estimated (T02 used the 44.1 kHz quantum and doubled it for staleness;
the staleness half does not apply on the audio thread).

Citations: Web Audio §1.1 (renderQuantumSize default 128), §1.1.1 (currentTime
per-quantum increments), §5.2 (block-processing mandate), §1.32.3
(AudioWorkletGlobalScope.currentTime / currentFrame — equal to BaseAudioContext
currentTime, incremented by 128); MDN AudioWorkletGlobalScope (currentFrame
"incremented by 128 after the processing of each audio block"); MDN
AudioWorkletProcessor ("process method gets called for each block of 128
sample-frames").

## 3. postMessage jitter

`AudioWorkletProcessor` communicates with its `AudioWorkletNode` via
`MessagePort` (`port.postMessage`, §1.32.3 / §1.32.4). Messages cross the
audio-thread → main-thread boundary and are delivered as tasks on the main
thread's task queue — the same delivery mechanism as `Worker.postMessage` and
`setTimeout`. T05 §3 established that task-queue drains happen "intra-frame
(between input events and the next RAF) but is not vsync-aligned — measured jitter
is task-queue-load-dependent, typically 0-4ms P50 on an idle main thread and
unbounded P95 under contention." T05 §8 quantified the worker postMessage hop at
~0.1-1 ms P50 / ~1-5 ms P95 (no spec guarantee; implementation-defined). The
AudioWorklet → main-thread hop is the same kind of hop. So: **the worklet can
report a fresh `currentTime` for the block it just rendered, but that value arrives
on the main thread 0.1-1 ms later P50 (worse under load), by which point the audio
thread has advanced another fraction of a quantum.** The postMessage jitter
partially cancels the freshness win: a value that was "0–2.67 ms fresher than
`currentTime`" when read becomes "0–2.67 ms fresher minus 0.1-1 ms of postMessage
delay" when consumed. In the worst case (main thread busy, P95 ~5 ms hop) the
worklet-reported value can be **staler** than a direct `getOutputTimestamp()` call
made at the same wall-clock instant, because `getOutputTimestamp()` is synchronous
on the main thread and returns immediately with the audio-thread-aligned
`contextTime` + `performanceTime` pair (§1.2.8).

Citations: Web Audio §1.32.3 (port — MessagePort for async communication),
§1.32.4 (AudioWorkletNode.port), §1.2.8 (AudioTimestamp / getOutputTimestamp),
§1.2.3 (AudioTimestamp dictionary members — contextTime + performanceTime);
T05 §3 (RAF + task-queue drain jitter), T05 §8 (postMessage hop 0.1-1ms P50 /
1-5ms P95).

## 4. Safari AudioWorklet support

AudioWorklet is **shipped in Safari stable** as of 2026-08-17. MDN marks
`AudioWorklet`, `AudioWorkletProcessor`, and `AudioWorkletGlobalScope` as
**Baseline "Widely available" since April 2021**. The caniuse `audio-api.json`
data (the closest caniuse entry; there is no standalone `audioworklet.json`)
shows Safari desktop at full `y` support from **14.1** onward (Safari 14.1
shipped May 2021) and iOS Safari at full `y` from **14.5** onward (April 2021);
all subsequent Safari releases (15.x, 16.x, 17.x, 18.x, 26.x) are `y`. The April
2021 MDN Baseline date aligns with iOS 14.5. So **every shipping Safari version a
2026 webosu player is likely to run (Safari ≥ 15) supports AudioWorklet**;
Safari 14.0 and earlier do not, but those are pre-2021 releases with negligible
2026 share. The `ScriptProcessorNode` fallback the ticket worried about is
**not needed for Safari** — and would in any case be a regression
(`ScriptProcessorNode` is deprecated per Web Audio §1.29 and runs its
`audioprocess` callback on the main thread, giving no clock win over reading
`AudioContext.currentTime` directly). Safari's `AudioContext` also supports
`getOutputTimestamp()` (it's in the Web Audio §1.2.8 spec and Safari has shipped
the full Web Audio API since 14.1 per caniuse), so the alternative bridge works
on Safari too.

Citations: MDN AudioWorklet / AudioWorkletProcessor / AudioWorkletGlobalScope
(Baseline "Widely available" since April 2021); caniuse `audio-api.json` Safari
timeline (14.1 = `y`, 14.5 iOS = `y`, all later `y`); Web Audio §1.29
(ScriptProcessorNode — DEPRECATED); Web Audio §1.2.8 (getOutputTimestamp — spec'd,
shipped with full Web Audio support).

## 5. Howler + AudioWorklet coexistence

**This question is moot for the gameplay clock.** Howler owns an `AudioContext`
(`Howler.ctx`, created lazily), and an AudioWorklet can absolutely share that
context — the Web Audio spec (§1.32, `BaseAudioContext.audioWorklet`) exposes
exactly one `AudioWorklet` per `BaseAudioContext`, and `audioWorklet.addModule()`
registers processors on that context's audio thread; there is no requirement for a
parallel context. So a worklet on `Howler.ctx` is spec-legal. **But Howler's
context is only used for hitsounds** in webosu (`src/game/sound.js` — `GameSound`
wraps `Howl` for short sfx; `window.actx = Howler.ctx` is exposed only for the
resume-on-gesture path). The **song clock** uses a **separate, dedicated
`AudioContext`** created at `src/game/osu-audio.js:134`
(`new AudioContext({ latencyHint: "interactive", sampleRate: 48000 })`). That
context owns the `AudioBufferSourceNode` playing the beatmap audio and is what
`_getPosition()` (`osu-audio.js:178-196`) reads. So an AudioWorklet intended to
tighten the **gameplay** clock would attach to **osu-audio's context**, not
Howler's — no coexistence problem exists, because Howler and the song clock are
already on separate contexts and the worklet would live on the song side.
**Resolves the "AudioWorklet + Howler coexistence" fog item: no conflict; the
worklet goes on `osu-audio.js`'s context.** (A worklet on Howler's context would
only tighten hitsound scheduling, which is not latency-sensitive — hitsounds fire
on judgement events, not as a clock reference.)

Citations: Web Audio §1.32 (BaseAudioContext.audioWorklet — one AudioWorklet per
context, addModule registers on that context's thread); webosu `src/game/sound.js`
(Howler for hitsounds, `window.actx = Howler.ctx`); webosu `src/game/osu-audio.js:134`
(separate AudioContext for song playback), `osu-audio.js:178-196` (`_getPosition`
reads `self.audio.currentTime` / `getOutputTimestamp`).

## 6. Cost/benefit

**Implementation cost** (to put an AudioWorklet clock on `osu-audio.js`'s context):
write a `clock-worklet.js` (a `AudioWorkletProcessor` subclass that reads
`currentTime` / `currentFrame` in `process()` and `port.postMessage`s them); call
`audio.audioWorklet.addModule('clock-worklet.js')` after context creation; create
an `AudioWorkletNode` connected to the context (it can be a no-op node connected to
`destination` or to a zero-gain node); wire `node.port.onmessage` in `osu-audio.js`
to update a `workletClock` field; change `_getPosition()` to read `workletClock`
instead of `self.audio.currentTime` / `getOutputTimestamp()`. Plus: handle the
async `addModule` (the context is created in the `OsuAudio` constructor which is
not async), handle worklet node teardown on `pause`/`stop`/`seekforward`, and A/B
test. **Estimated effort: 1-2 days for a working prototype, half a day for the A/B
measurement.** Modest.

**Expected win: ~0 ms, possibly negative.** The win analysis:

- `osu-audio.js`'s `_getPosition()` **already calls `getOutputTimestamp()`**
  (`osu-audio.js:184-187`) and uses `ts.contextTime` when available. Per Web Audio
  §1.2.8 / §1.2.3, `getOutputTimestamp()` returns the audio-thread-aligned
  `contextTime` (the audio clock) paired with a `performanceTime` (`performance.now()`
  clock) sampled at the same instant — this is **the spec's intended bridge between
  the audio clock and the main-thread monotonic clock**, and it is synchronous on
  the main thread (no postMessage hop). It gives the main thread a fresh,
  audio-thread-aligned clock value **with zero postMessage jitter**.
- An AudioWorklet clock would replace that synchronous read with an **asynchronous**
  one: `process()` reads `currentTime` on the audio thread (freshness: same quantum
  as `getOutputTimestamp()`'s `contextTime`), then `port.postMessage`s it to the
  main thread, where it arrives 0.1-1 ms later P50 (§3). The consumed value is
  therefore **staler** than a `getOutputTimestamp()` call made at the same
  wall-clock instant, because `getOutputTimestamp()` returns immediately while the
  postMessage value is delayed by a task-queue drain.
- The AudioWorklet's only theoretical advantage over `getOutputTimestamp()` is that
  it can report `currentTime` **at the moment the audio callback ran** rather than
  at the moment the main thread asked. But `getOutputTimestamp()` already
  timestamps both clocks at the same instant, so the main thread can compute
  "where the audio is now" as `contextTime + (performance.now() - performanceTime)`,
  which is a fresher estimate than the worklet's posted value by the postMessage
  delay. **The worklet is strictly worse than the bridge that is already
  implemented.**
- The win is also **below RAF jitter** in the input-to-judgement path. T05 §3
  established the input-to-judgement floor is dominated by vsync quantization
  (~16.67 ms @ 60 Hz) and input delivery delay (0-16.67 ms), totaling ~9 ms P50 /
  ~20 ms P95 at 60 Hz. The audio clock's quantum quantization (~2.67 ms) is already
  3-7× smaller than the dominant vsync term, and `getOutputTimestamp()` already
  eliminates the 0-2.67 ms cross-thread staleness that raw `currentTime` has. A
  worklet would shave at most one quantum (~2.67 ms) of freshness off a clock that
  is already not the bottleneck — and then give it back via postMessage jitter. The
  net is **not measurable above RAF jitter**.

**Conclusion: the win disappears.** `osu-audio.js` already uses the spec-recommended
`getOutputTimestamp()` bridge, which is synchronous and audio-thread-aligned. An
AudioWorklet clock is an asynchronous, higher-jitter path to the same
audio-thread-aligned value. The implementation cost is modest but the expected win
is zero-to-negative.

Citations: webosu `src/game/osu-audio.js:178-196` (`_getPosition` already uses
`getOutputTimestamp`); Web Audio §1.2.8 / §1.2.3 (AudioTimestamp =
contextTime + performanceTime, synchronous main-thread read); T05 §3 (RAF +
vsync floor ~9ms P50 / ~20ms P95 @ 60 Hz); T05 §8 (postMessage hop 0.1-1ms P50).

---

## Decision

**Skip.**

**Reasoning:** The ticket's premise — "Howler's `currentTime` is the gameplay clock
and an AudioWorklet would tighten it" — is wrong on two counts that the source
audit revealed: (1) Howler is only used for hitsounds (`src/game/sound.js`); the
gameplay song clock is `src/game/osu-audio.js`, which uses its own `AudioContext`
(`osu-audio.js:134`), so there is no Howler-coexistence problem and no Howler-clock
to replace. (2) `osu-audio.js`'s `_getPosition()` **already calls
`getOutputTimestamp()`** (`osu-audio.js:184-187`) — the spec-recommended
(Web Audio §1.2.8) synchronous bridge between the audio clock and
`performance.now()`. That bridge is audio-thread-aligned **and** synchronous on the
main thread, so it has zero postMessage jitter. An AudioWorklet clock would replace
a synchronous audio-thread-aligned read with an **asynchronous** one
(`process()` → `port.postMessage` → task-queue drain = 0.1-1 ms P50, ~1-5 ms P95
per T05 §8), making the consumed value **staler** than what
`getOutputTimestamp()` returns at the same wall-clock instant. The worklet's only
theoretical edge (reading `currentTime` at audio-callback time) is already captured
by `getOutputTimestamp()`'s paired `contextTime`/`performanceTime`, which the main
thread can extrapolate forward. T05's corrected render-quantum value (128 frames ≈
2.67 ms @ 48 kHz, not ~0.02 ms) means the maximum possible freshness win is one
quantum, and that win is then given back (and then some) by the postMessage hop.
The net is below RAF jitter (T05 §3: ~9 ms P50 / ~20 ms P95 @ 60 Hz input floor),
so the AudioWorklet clock would not improve input-to-judgement latency. Safari is
not a blocker (AudioWorklet ships in Safari ≥ 14.1 / iOS ≥ 14.5, MDN Baseline
April 2021), but Safari support doesn't help when the win is zero-to-negative on
the browsers that do support it.

**One-line entry for `docs/lazer-feel-deltas.md`:**

> **AudioWorklet tight clock: considered, not pursued.** `osu-audio.js:184-187`
> already uses `AudioContext.getOutputTimestamp()` (Web Audio §1.2.8), the
> synchronous, audio-thread-aligned bridge between `contextTime` and
> `performance.now()`. An AudioWorklet clock would be a higher-jitter (postMessage
> hop, 0.1-1 ms P50 / 1-5 ms P95) path to the same quantum-quantized value
> (render quantum = 128 frames ≈ 2.67 ms @ 48 kHz, per T05 correction), so the net
> win is zero-to-negative and below the RAF vsync floor (~9 ms P50 @ 60 Hz, T05 §3).
> Howler coexistence is moot — Howler is hitsounds only; the song clock uses a
> separate `AudioContext` (`osu-audio.js:134`). Closed by T09.