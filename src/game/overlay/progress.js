class ProgressOverlay extends PIXI.Container {
  constructor(windowfield, starttime, endtime) {
    super();

      // constructor.
      this.starttime = starttime;
      this.endtime = endtime;

      // remaining time, in lower right corner
      this.remaining = new PIXI.Text({ text: "", style: {
         fontFamily: "Comfortaa",
         fontSize: 25,
         fill: "#ddffff",
      } });
      this.remaining.anchor.set(1);
      this.addChild(this.remaining);
      this.past = new PIXI.Text({ text: "", style: {
         fontFamily: "Comfortaa",
         fontSize: 25,
         fill: "#ddffff",
      } });
      this.past.anchor.set(0, 1);
      this.addChild(this.past);

      this.resize = function (windowfield) {
         this.remaining.x = windowfield.width - 10;
         this.remaining.y = windowfield.height - 10;
         this.past.x = 10;
         this.past.y = windowfield.height - 10;
      };
      this.resize(windowfield);

      function timeformat(seconds) {
         let s = Math.round(seconds);
         let prefix = "";
         if (s < 0) {
            prefix = "-";
            s = -s;
         }
         return (
            prefix +
            Math.floor(s / 60) +
            ":" +
            (s % 60 < 10 ? "0" : "") +
            (s % 60)
         );
      }

      // parameter t: time(ms) to next approach object; -1 if unavailable
      this.update = function (time) {
         if (Number.isNaN(time)) return;
         let remStr = timeformat(Math.max(0, (this.endtime - time) / 1000));
         if (this.remaining.text !== remStr) this.remaining.text = remStr;
         let pastStr = timeformat((time - this.starttime) / 1000);
         if (this.past.text !== pastStr) this.past.text = pastStr;
      };
    
  }
}
export default ProgressOverlay;
