// src/game/curves/Curve.js — base class for slider curves (M1.4).
//
// The single contract for every Curve subclass is:
//   pointAtInto(t: number, out: { x: number, y: number }) -> { x: number, y: number }
// where t ∈ [0, 1] and `out` is a caller-supplied point that the
// implementation writes into and returns (for chaining).
//
// Every concrete curve type (Bezier2, CircumscribedCircle,
// EqualDistanceMultiCurve, LinearBezier) implements pointAtInto. The
// hot path (playback.js slider update) calls pointAtInto with a single
// reused `_tmpPt1` Point so the per-frame slider update allocates zero
// bytes past warmup.
//
// The legacy `pointAt(t)` API is retained on the subclasses as a thin
// wrapper that allocates a fresh point. New code MUST use pointAtInto;
// the grep audit (M1.4 verification) confirms no per-frame `pointAt(t)`
// callers remain.
//
// CurveType.js is a parallel root that holds the pre-sampled curve
// data array (curve[], curveDistance[], totalDistance). It does not
// inherit from Curve — the two are roots of two small hierarchies that
// share the `lerp` static via Curve.lerp.

function Curve(hitObject) {
   if (new.target === Curve) {
      throw new TypeError("Curve is a base class; cannot instantiate directly");
   }
   this.hitObject = hitObject;
}
Curve.lerp = function lerp(a, b, t) {
   return a * (1 - t) + b * t;
};

/**
 * `pointAtInto(t, out)` is the M1.4 contract. Subclasses MUST override.
 * Default throws so any subclass that forgets is caught at construction.
 */
Curve.prototype.pointAtInto = function pointAtInto(/* t, out */) {
   throw new Error("Curve subclass must implement pointAtInto(t, out)");
};

/**
 * Convenience wrapper that allocates a new point. New code should NOT
 * use this; it exists for legacy callers and tests.
 */
Curve.prototype.pointAt = function pointAt(t) {
   const out = { x: 0, y: 0 };
   return this.pointAtInto(t, out);
};

export default Curve;
