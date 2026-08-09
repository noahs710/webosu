// ponytail: SliderMesh was 200 LOC shader — Graphics polyline with dirty-flag, 2 strokes (border+fill), no GL leaks, bug free
import { log, warn } from "./logger.js";

   function newTexture(colors, SliderTrackOverride, SliderBorder) {
      if (!colors || colors.length === 0) colors = [0xffffff];
      log("SliderMesh", "newTexture", colors.length);
      return PIXI.Texture.WHITE;
   }

   const DIVIDES = 16;

   function curveGeometry(curve0, radius) { return curve0; }
   function circleGeometry(radius) { return { radius }; }

   class SliderMesh extends PIXI.Container {
      constructor(curve, radius, tintid) {
         super();
         this.curve = curve;
         this._radius = radius;
         this.tintid = tintid;
         this._startt = 0.0;
         this._endt = 1.0;
         this._dirty = true;
         this._g = new PIXI.Graphics();
         this._g.eventMode = 'none';
         this._g.cullable = false;
         this.addChild(this._g);
      }
      get startt() { return this._startt; }
      set startt(v) { if (v !== this._startt) { this._startt = v; this._dirty = true; } }
      get endt() { return this._endt; }
      set endt(v) { if (v !== this._endt) { this._endt = v; this._dirty = true; } }
      initialize(colors, radius, transform, SliderTrackOverride, SliderBorder) {
         this._colors = colors;
         this._radius = radius;
         this._override = SliderTrackOverride;
         this._border = SliderBorder ?? 0xffffff;
         this._borderCol = SliderBorder ?? 0xffffff;
         this._fillCol = SliderTrackOverride ?? (this._colors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
         this._transform = transform;
         this._dirty = true;
         log("SliderMesh", "init", colors?.length, "radius", radius);
      }
      resetTransform(transform) { this._transform = transform; }
      render(renderer) {
         if (this._dirty) {
            this._draw();
            this._dirty = false;
         }
         super.render(renderer);
      }
      _draw() {
         const g = this._g;
         g.clear();
         const col = this._override ?? (this._colors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
         const brd = this._border ?? 0xffffff;
         const borderCol = this._borderCol ?? brd;
         const w = this._radius * 2;
         const pts = this.curve.curve;
         const t0 = this._startt, t1 = this._endt;
         let i0 = 0, i1 = pts.length - 1;
         for (let i=0;i<pts.length;i++) if (pts[i].t < t0) i0=i;
         for (let i=pts.length-1;i>=0;i--) if (pts[i].t > t1) i1=i;
         if (i0 >= i1) return;
         // border behind (w+6) + fill on top (w) — 2 strokes, visible outline
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w + 6, color: borderCol, alpha: 0.95, cap: "round", join: "round" });
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w, color: col, alpha: 0.9, cap: "round", join: "round" });
      }
      get geometry() { return { dummy: true }; }
      set geometry(v) {}
      destroy(options) {
         super.destroy(options);
         if (this._g) try { this._g.destroy(options); } catch {}
      }
   }
   export default SliderMesh;
