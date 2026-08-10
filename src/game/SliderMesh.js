// ponytail: SliderMesh was 200 LOC shader — Graphics polyline with dirty-flag, 2 strokes (border+fill), no GL leaks, bug free
import { log, warn } from "./logger.js";

   const DIVIDES = 16;

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
         this._g = new PIXI.Graphics();
         this._g.eventMode = 'none';
         this._g.cullable = false;
         this.addChild(this._g);
         // Pixi v8: container.render no longer ticks every frame — use onRender per skill
         this.onRender = () => {
            if (this._dirty) {
               this._draw();
               this._dirty = false;
            }
         };
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
         try {
            const qp = new URLSearchParams(window.location.search).get('gradient');
            this._gradientMode = qp === 'linear' || qp === 'textured' ? qp : 'flat';
            const sp = new URLSearchParams(window.location.search).get('slider');
            this._sliderMode = sp === 'a' || sp === 'b' || sp === 'c' ? sp : null;
            const cp = new URLSearchParams(window.location.search).get('cull');
            this._cullMode = cp === 'true' ? true : cp === 'false' ? false : null;
            if (this._cullMode !== null) {
               this.cullable = this._cullMode;
               this._g.cullable = this._cullMode;
               if (this._cullMode) this.cullArea = new PIXI.Rectangle(0, 0, 512, 384);
            }
         } catch { this._gradientMode = 'flat'; this._sliderMode = null; this._cullMode = null; }
         log("SliderMesh", "init", colors?.length, "radius", radius, "gradient", this._gradientMode, "slider", this._sliderMode, "cull", this._cullMode);
         if (import.meta.env.DEV && !this._cullLogged) {
            try {
               const b0 = this.getBounds?.() || this._g?.getBounds?.();
               log("SliderMesh", "cull spike bounds before _draw", { cullable: this.cullable, cullArea: this.cullArea, bounds: b0, pts: this.curve?.curve?.length });
            } catch {}
            this._cullLogged = true;
         }
      }
      resetTransform(transform) { this._transform = transform; this._dirty = true; }
      _draw() {
         const g = this._g;
         g.clear();
         const hasColors = this._colors && this._colors.length > 0;
         const col = this._override ?? (hasColors ? this._colors[this.tintid % this._colors.length] : 0xffffff);
         const finalCol = (col == null || col === undefined) ? 0xffffff : col;
         const brd = this._border ?? 0xffffff;
         const borderCol = (this._borderCol != null ? this._borderCol : brd) ?? 0xffffff;
         const w = (this._radius || 20) * 2;
         const pts = this.curve && this.curve.curve ? this.curve.curve : null;
         if (!pts || pts.length < 2) return;
         const t0 = this._startt, t1 = this._endt;
         let i0 = 0, i1 = pts.length - 1;
         for (let i=0;i<pts.length;i++) if (pts[i].t < t0) i0=i;
         for (let i=pts.length-1;i>=0;i--) if (pts[i].t > t1) i1=i;
         if (i0 >= i1) return;
         // slider-shader-ab spike: ?slider=a|b|c takes precedence over ?gradient
         const sliderMode = this._sliderMode;
         if (sliderMode === 'a') {
            // A: 2-stroke border+fill (no shadow) — see-through baseline
            g.moveTo(pts[i0].x, pts[i0].y);
            for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
            g.stroke({ width: w + 6, color: borderCol, alpha: 0.95, cap: "round", join: "round" });
            g.moveTo(pts[i0].x, pts[i0].y);
            for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
            g.stroke({ width: w, color: finalCol, alpha: 0.9, cap: "round", join: "round" });
            this._g.visible = true;
            if (this._rope) { try { this.removeChild(this._rope); this._rope.destroy(); } catch {} this._rope = null; }
            return;
         }
         if (sliderMode === 'c' && PIXI?.MeshRope) {
            try {
               const tex = PIXI.Texture.WHITE;
               const slice = [];
               for (let i=i0;i<=i1;i++) slice.push(new PIXI.Point(pts[i].x, pts[i].y));
               if (slice.length >= 2) {
                  // 2 ropes: border w+6 + fill w, textureScale:0, tint
                  if (!this._rope || !this._borderRope) {
                     if (this._rope) try { this.removeChild(this._rope); this._rope.destroy(); } catch {}
                     if (this._borderRope) try { this.removeChild(this._borderRope); this._borderRope.destroy(); } catch {}
                     this._rope = new PIXI.MeshRope({ texture: tex, points: slice.slice(), width: w, textureScale: 0 });
                     this._borderRope = new PIXI.MeshRope({ texture: tex, points: slice.slice(), width: w + 6, textureScale: 0 });
                     this._rope.eventMode = 'none'; this._rope.cullable = false; this._borderRope.eventMode = 'none'; this._borderRope.cullable = false;
                     try { this._rope.tint = finalCol; } catch {}
                     try { this._borderRope.tint = borderCol; } catch {}
                     this.addChild(this._borderRope); this.addChild(this._rope);
                     this._g.visible = false;
                  } else {
                     this._rope.points = slice.slice(); this._borderRope.points = slice.slice();
                     if (this._rope.geometry?.update) try { this._rope.geometry.update(); } catch {}
                     if (this._borderRope.geometry?.update) try { this._borderRope.geometry.update(); } catch {}
                     try { this._rope.tint = finalCol; } catch {}
                     try { this._borderRope.tint = borderCol; } catch {}
                  }
                  this._g.visible = false;
                  return;
               }
            } catch {}
         } else if (this._borderRope) {
            try { this.removeChild(this._borderRope); this._borderRope.destroy(); } catch {}
            this._borderRope = null;
         }
         const mode = this._gradientMode || 'flat';
         // textured spike: MeshRope with sliderb.png repeating (if available)
         if (mode === 'textured' && window.Skin?.['sliderb.png'] && PIXI?.MeshRope) {
            try {
               const tex = window.Skin['sliderb.png'];
               const slice = [];
               for (let i=i0;i<=i1;i++) slice.push(new PIXI.Point(pts[i].x, pts[i].y));
               if (slice.length >= 2) {
                  if (!this._rope) {
                     this._rope = new PIXI.MeshRope({ texture: tex, points: slice, width: w, textureScale: 1 });
                     this._rope.eventMode = 'none'; this._rope.cullable = false;
                     this.addChild(this._rope);
                     this._g.visible = false;
                  } else {
                     this._rope.points = slice;
                     if (this._rope.geometry?.update) try { this._rope.geometry.update(); } catch {}
                  }
                  // still draw border underneath for outline
                  g.moveTo(pts[i0].x, pts[i0].y);
                  for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
                  g.stroke({ width: w + 6, color: borderCol, alpha: 0.95, cap: "round", join: "round" });
                  g.moveTo(pts[i0].x, pts[i0].y);
                  for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
                  g.stroke({ width: w + 4, color: 0x000000, alpha: 0.35, cap: "round", join: "round" });
                  this._g.visible = true;
                  return;
               }
            } catch {}
         } else if (this._rope) {
            try { this.removeChild(this._rope); this._rope.destroy(); } catch {}
            this._rope = null;
            this._g.visible = true;
         }
         // polish: 3-layer opaque for visibility on dim bg — shadow 0.35 + crisp border 1.0 + solid fill 1.0 + subtle inner highlight 0.45
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w + 4, color: 0x000000, alpha: 0.35, cap: "round", join: "round" });
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         g.stroke({ width: w + 6, color: borderCol, alpha: 1, cap: "round", join: "round" });
         // fill: flat vs linear gradient
         let fillColor = finalCol;
         if (mode === 'linear' && PIXI?.FillGradient) {
            try {
               const lighten = (c, amt) => {
                  const r = Math.min(255, ((c>>16)&255) + amt*255);
                  const g2 = Math.min(255, ((c>>8)&255) + amt*255);
                  const b = Math.min(255, (c&255) + amt*255);
                  return (r<<16)|(g2<<8)|b;
               };
               const darken = (c, amt) => {
                  const r = Math.max(0, ((c>>16)&255) - amt*255);
                  const g2 = Math.max(0, ((c>>8)&255) - amt*255);
                  const b = Math.max(0, (c&255) - amt*255);
                  return (r<<16)|(g2<<8)|b;
               };
               fillColor = new PIXI.FillGradient({ type: 'linear', colorStops: [
                  { offset: 0, color: darken(finalCol, 0.18) },
                  { offset: 0.5, color: finalCol },
                  { offset: 1, color: lighten(finalCol, 0.18) }
               ]});
            } catch {}
         }
         g.moveTo(pts[i0].x, pts[i0].y);
         for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
         // Pixi v8: gradient strokes use `fill: gradient`, solid uses `color`
         if (fillColor && fillColor instanceof PIXI.FillGradient) {
            g.stroke({ width: w, fill: fillColor, alpha: 1, cap: "round", join: "round" });
         } else {
            g.stroke({ width: w, color: fillColor, alpha: 1, cap: "round", join: "round" });
         }
         // ponytail: one extra 1px inner highlight for depth — cheap, visible at 73px wide
         try {
            const hl = Math.min(255, ((finalCol>>16)&255) + 42) << 16 | Math.min(255, ((finalCol>>8)&255) + 42) << 8 | Math.min(255, (finalCol&255) + 42);
            g.moveTo(pts[i0].x, pts[i0].y);
            for (let i=i0+1;i<=i1;i++) g.lineTo(pts[i].x, pts[i].y);
            g.stroke({ width: Math.max(2, w - 8), color: hl, alpha: 0.28, cap: "round", join: "round" });
         } catch {}
         this._g.visible = true;
         if (import.meta.env.DEV && this._cullMode !== null && !this._afterLogged) {
            try {
               const b1 = this.getBounds?.() || this._g?.getBounds?.();
               log("SliderMesh", "cull spike bounds after _draw", { cullable: this.cullable, bounds: b1, w, pts: pts.length, mode, sliderMode });
            } catch {}
            this._afterLogged = true;
         }
      }
       // Pixi v8 Mesh uses MeshGeometry with positions/uvs/indices — this SliderMesh is NOT a Mesh
       // but a Container+Graphics (ponytail). Do not expose fake geometry; callers should not check it.
       destroy(options) {
          this.onRender = null;
          // destroy children before super.destroy to avoid double-destroy (super.destroy recurses children)
          if (this._rope) try { this._rope.destroy(options); this._rope = null; } catch {}
          if (this._borderRope) try { this._borderRope.destroy(options); this._borderRope = null; } catch {}
          if (this._g) try { this._g.destroy(options); this._g = null; } catch {}
          super.destroy(options);
       }
   }
   export default SliderMesh;
