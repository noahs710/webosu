// ponytail: SliderMesh was 200 LOC custom shader — replaced with MeshRope (GPU batched) with Graphics fallback, keeps border+fill
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
         this._rope = null;
         this._borderRope = null;
         this._g = null;
      }
      get startt() { return this._startt; }
      set startt(v) { if (v !== this._startt) { this._startt = v; this._dirty = true; } }
      get endt() { return this._endt; }
      set endt(v) { if (v !== this._endt) { this._endt = v; this._dirty = true; } }
      initialize(colors, radius, transform, SliderTrackOverride, SliderBorder) {
         this._colors = colors;
         this._radius = radius;
         this._override = SliderTrackOverride;
         this._border = SliderTrackOverride ?? SliderBorder ?? 0xffffff;
         this._borderCol = SliderBorder ?? 0xffffff;
         this._transform = transform;
         this._dirty = true;
         log("SliderMesh", "init", colors?.length, "radius", radius);
         try {
            if (PIXI.MeshRope && this.curve && this.curve.curve && this.curve.curve.length >= 2) {
               const pts = this.curve.curve.map(p => new PIXI.Point(p.x, p.y));
               const tex = PIXI.Texture.WHITE;
               const fillCol = this._override ?? (this._colors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
               const borderCol = this._border ?? 0xffffff;
               // border behind, fill on top — two ropes for outline
               this._borderRope = new PIXI.MeshRope({ texture: tex, points: pts.slice(), width: this._radius * 2 + 6, textureScale: 0 });
               this._borderRope.eventMode = 'none';
               this._borderRope.cullable = true;
               try { this._borderRope.tint = borderCol; } catch {}
               this._rope = new PIXI.MeshRope({ texture: tex, points: pts, width: this._radius * 2, textureScale: 0 });
               this._rope.eventMode = 'none';
               this._rope.cullable = true;
               try { this._rope.tint = fillCol; } catch {}
               this.addChild(this._borderRope);
               this.addChild(this._rope);
            }
         } catch (e) {
            try { if (this._borderRope) { this.removeChild(this._borderRope); this._borderRope.destroy(); } } catch {}
            try { if (this._rope) { this.removeChild(this._rope); this._rope.destroy(); } } catch {}
            this._borderRope = null;
            this._rope = null;
         }
         if (!this._rope) {
            try {
               this._g = new PIXI.Graphics();
               this._g.eventMode = 'none';
               this._g.cullable = true;
               this.addChild(this._g);
            } catch {}
         }
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
         const col = this._override ?? (this._colors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
         const brd = this._border ?? 0xffffff;
         const borderCol = this._borderCol ?? brd;
         // MeshRope path with border
         if (this._rope && this._borderRope) {
            try { this._rope.tint = col; } catch {}
            try { this._borderRope.tint = borderCol; } catch {}
            const pts = this.curve.curve;
            const t0 = this._startt, t1 = this._endt;
            let i0 = 0, i1 = pts.length - 1;
            for (let i=0;i<pts.length;i++) if (pts[i].t < t0) i0=i;
            for (let i=pts.length-1;i>=0;i--) if (pts[i].t > t1) i1=i;
            if (i0 >= i1) { this._rope.visible = false; this._borderRope.visible = false; return; }
            this._rope.visible = true;
            this._borderRope.visible = true;
            const slice = [];
            for (let i=i0;i<=i1;i++) slice.push(new PIXI.Point(pts[i].x, pts[i].y));
            if (slice.length < 2) { this._rope.visible = false; this._borderRope.visible = false; return; }
            try {
               this._rope.points = slice;
               this._borderRope.points = slice.slice();
               if (this._rope.geometry && this._rope.geometry.update) try { this._rope.geometry.update(); } catch {}
               if (this._borderRope.geometry && this._borderRope.geometry.update) try { this._borderRope.geometry.update(); } catch {}
            } catch (e) {
               try {
                  const tex = this._rope.texture || PIXI.Texture.WHITE;
                  const newRope = new PIXI.MeshRope({ texture: tex, points: slice, width: this._radius * 2, textureScale: 0 });
                  const newBorder = new PIXI.MeshRope({ texture: tex, points: slice.slice(), width: this._radius * 2 + 6, textureScale: 0 });
                  newRope.tint = col; newBorder.tint = borderCol;
                  newRope.eventMode = 'none'; newBorder.eventMode = 'none';
                  newRope.cullable = true; newBorder.cullable = true;
                  this.removeChild(this._borderRope); this.removeChild(this._rope);
                  try { this._rope.destroy(); } catch {}
                  try { this._borderRope.destroy(); } catch {}
                  this._borderRope = newBorder; this._rope = newRope;
                  this.addChild(this._borderRope); this.addChild(this._rope);
               } catch {}
            }
            return;
         }
         if (!this._g) {
            try {
               this._g = new PIXI.Graphics();
               this._g.eventMode = 'none';
               this._g.cullable = true;
               this.addChild(this._g);
            } catch { return; }
         }
         const g = this._g;
         g.clear();
         const w = this._radius * 2;
         const pts = this.curve.curve;
         const t0 = this._startt, t1 = this._endt;
         let i0 = 0, i1 = pts.length - 1;
         for (let i=0;i<pts.length;i++) if (pts[i].t < t0) i0=i;
         for (let i=pts.length-1;i>=0;i--) if (pts[i].t > t1) i1=i;
         if (i0 >= i1) return;
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w+6, color: borderCol, alpha: 0.9, cap: "round", join: "round" });
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w, color: col, alpha: 0.85, cap: "round", join: "round" });
      }
      get geometry() {
         if (this._rope && this._rope.geometry) return this._rope.geometry;
         if (this._borderRope && this._borderRope.geometry) return this._borderRope.geometry;
         return { dummy: true };
      }
      set geometry(v) {}
      destroy(options) {
         super.destroy(options);
         if (this._rope) try { this._rope.destroy(options); } catch {}
         if (this._borderRope) try { this._borderRope.destroy(options); } catch {}
         if (this._g) try { this._g.destroy(options); } catch {}
      }
   }
   export default SliderMesh;
