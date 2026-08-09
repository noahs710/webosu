// ponytail: SliderMesh was 200 LOC custom shader — replaced with PIXI.Graphics polyline, same look, no GL leaks
import { log, warn } from "./logger.js";
var Container = PIXI.Container;

   function newTexture(colors, SliderTrackOverride, SliderBorder) {
      if (!colors || colors.length === 0) colors = [0xffffff];
      log("SliderMesh", "newTexture", colors.length);
      // 1x1 white pixel tinted per-slider; Graphics stroke does the rest
      return PIXI.Texture.WHITE;
   }

   // ponytail: keep curve math, drop GL — Graphics does the same with 1/10th the code
   const DIVIDES = 16; // fewer points for Graphics, still smooth
   function curveGeometry(curve0, radius) { return curve0; } // not used, kept for API compat
   function circleGeometry(radius) { return { radius }; }

   class SliderMesh extends PIXI.Container {
      constructor(curve, radius, tintid) {
         super();
         this.curve = curve;
         this._radius = radius;
         this.tintid = tintid;
         this.startt = 0.0;
         this.endt = 1.0;
         this._g = new PIXI.Graphics();
         this.addChild(this._g);
      }
      initialize(colors, radius, transform, SliderTrackOverride, SliderBorder) {
         this._colors = colors;
         this._radius = radius;
         this._override = SliderTrackOverride;
         this._border = SliderTrackOverride ?? SliderBorder ?? 0xffffff;
         this._transform = transform;
         log("SliderMesh", "init", colors?.length, "radius", radius);
      }
      resetTransform(transform) { this._transform = transform; }
      render(renderer) {
         this._draw();
         this._g.alpha = this.alpha * this.worldAlpha;
         super.render(renderer);
      }
      // called by playback before render to update visible segment
      _draw() {
         const g = this._g;
         g.clear();
         const col = this._override ?? (this._colors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
         const brd = this._border ?? 0xffffff;
         const w = this._radius * 2;
         // track
         const pts = this.curve.curve;
         const t0 = this.startt, t1 = this.endt;
         // find indices for t range
         let i0 = 0, i1 = pts.length - 1;
         for (let i=0;i<pts.length;i++) if (pts[i].t < t0) i0=i;
         for (let i=pts.length-1;i>=0;i--) if (pts[i].t > t1) i1=i;
         if (i0 >= i1) return;
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w, color: col, alpha: 0.85, cap: "round", join: "round" });
         // border
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w+3, color: brd, alpha: 0.9, cap: "round", join: "round" });
         // inner again for crisp
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w-1, color: col, alpha: 1, cap: "round", join: "round" });
      }
      get geometry() { return this._g.geometry; }
      set geometry(v) {}
      destroy(options) { super.destroy(options); if (this._g) this._g.destroy(options); }
   }
   // playback sets body.startt/endt then render will call _draw via update; hook into alpha setter
   Object.defineProperty(SliderMesh.prototype, 'alpha', {
      get() { return this._alpha ?? 1; },
      set(v) { this._alpha = v; if (this._g) this._g.alpha = v; }
   });
   export default SliderMesh;
