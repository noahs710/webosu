
   function syncStream(node) {
      // https://stackoverflow.com/questions/10365335/decodeaudiodata-returning-a-null-error
      var buf8 = new Uint8Array(node.buf);
      buf8.indexOf = Array.prototype.indexOf;
      var i = node.sync,
         b = buf8;
      while (1) {
         node.retry++;
         i = b.indexOf(0xff, i);
         if (i == -1 || (b[i + 1] & 0xe0) == 0xe0) break;
         i++;
      }
      if (i != -1) {
         var tmp = node.buf.slice(i);
         delete node.buf;
         node.buf = null;
         node.buf = tmp;
         node.sync = i;
         return true;
      }
      return false;
   }

   function offset_predict_mp3(tags) {
      let default_offset = 22;
      if (!tags || !tags.length) {
         if (import.meta.env.DEV) console.warn("mp3 offset predictor: mp3 tag missing");
         return default_offset;
      }
      let frametag = tags[tags.length - 1];
      if (frametag._section.sampleLength != 1152) {
         if (import.meta.env.DEV) console.warn("mp3 offset predictor: unexpected sample length");
         return default_offset;
      }
      let vbr_tag = null;
      for (let i = 0; i < tags.length; ++i)
         if (tags[i]._section.type == "Xing") vbr_tag = tags[i];
      if (!vbr_tag) {
         return default_offset;
      }
      if (!vbr_tag.identifier) {
         if (import.meta.env.DEV) console.warn("mp3 offset predictor: vbr tag identifier missing");
         return default_offset;
      }
      if (vbr_tag.vbrinfo.ENC_DELAY != 576) {
         if (import.meta.env.DEV) console.warn("mp3 offset predictor: vbr ENC_DELAY value unexpected");
         return default_offset;
      }
      let sampleRate = vbr_tag.header.samplingRate;
      if (sampleRate == 32000) return 89 - 1152000 / sampleRate;
      if (sampleRate == 44100) return 68 - 1152000 / sampleRate;
      if (sampleRate == 48000) return 68 - 1152000 / sampleRate;
      if (import.meta.env.DEV) console.warn("mp3 offset predictor: sampleRate unexpected");
      return default_offset;
   }

   function preprocAudio(filename, buffer) {
      let suffix = filename.substr(-3);
      if (suffix != "mp3") {
         return {
            startoffset: 19,
         };
      }
      mp3Parser.readTagsNew = readTagsNew;
      let tags = mp3Parser.readTagsNew(new DataView(buffer));
      if (tags.length == 3 && tags[1]._section.type == "Xing") {
         let arr = new Uint8Array(
            buffer.byteLength - tags[1]._section.byteLength
         );
         arr.set(new Uint8Array(buffer, 0, tags[1]._section.offset), 0);
         let offsetAfter =
            tags[1]._section.offset + tags[1]._section.byteLength;
         arr.set(
            new Uint8Array(
               buffer,
               offsetAfter,
               buffer.byteLength - offsetAfter
            ),
            tags[0]._section.offset
         );
         buffer = arr.buffer;
         return {
            startoffset: offset_predict_mp3(tags),
            newbuffer: arr.buffer,
         };
      }
      return {
         startoffset: offset_predict_mp3(tags),
      };
   }

   //mp3 parser bug fix
   function readTagsNew(view, offset) {
      offset || (offset = 0);
      var sections = [];
      var section = null;
      var isFirstFrameFound = false;
      var bufferLength = view.byteLength;
      var readers = [
         mp3Parser.readId3v2Tag,
         mp3Parser.readXingTag,
         mp3Parser.readFrame,
      ];
      var numOfReaders = readers.length;
      for (; offset < bufferLength && !isFirstFrameFound; ++offset) {
         for (var i = 0; i < numOfReaders; ++i) {
            section = readers[i](view, offset);

            //***fix point***//
            if (section && section._section.byteLength) {
               sections.push(section);
               offset += section._section.byteLength;
               if (section._section.type === "frame") {
                  isFirstFrameFound = true;
                  break;
               }
               i = -1;
            }
         }
      }
      return sections;
   }

   function OsuAudio(filename, buffer, callback) {
      var self = this;
      this.decoded = null;
      this.source = null;
      this.started = 0;
      this.position = 0;
      this.playing = false;
      // ponytail: interactive hint = lowest output latency (vs balanced/playback); 48k matches decoded
      try {
         this.audio = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive", sampleRate: 48000 });
      } catch { this.audio = new (window.AudioContext || window.webkitAudioContext)(); }
      // hint the browser we want low latency (no-op if unsupported)
      try { if (this.audio.updateInterval) this.audio.updateInterval = 0.005; } catch {}
      this.gain = this.audio.createGain();
      this.gain.connect(this.audio.destination);
      this.playbackRate = 1.0;
      this.posoffset = 0;

      let t = preprocAudio(filename, buffer);
      if (t.startoffset) this.posoffset = t.startoffset;
      if (t.newbuffer) buffer = t.newbuffer;
      this.posoffset += (window.game?.globalOffset) || 0;

      function decode(node, retries) {
         retries = retries || 0;
         self.audio.decodeAudioData(
            node.buf,
            function (decoded) {
               self.decoded = decoded;
               if (typeof callback !== "undefined") {
                  callback(self);
               }
            },
            function (err) {
               console.error("Audio decode failed (retry " + retries + ")");
               if (retries < 3 && syncStream(node)) {
                  decode(node, retries + 1);
               } else if (typeof callback !== "undefined") {
                  callback(self);
               }
            }
         );
      }
      decode({
         buf: buffer,
         sync: 0,
         retry: 0,
      });

      this.getPosition = function () {
         return this._getPosition() - this.posoffset / 1000;
      };

      this._getPosition = function _getPosition() {
         if (!self.playing) return self.position;
         // ponytail: prefer getOutputTimestamp for sub-ms sync (lowest render-audio drift)
         let now = self.audio.currentTime;
         let usedOutputTs = false;
         try {
            if (typeof self.audio.getOutputTimestamp === "function") {
               const ts = self.audio.getOutputTimestamp();
               if (ts && ts.contextTime != null) { now = ts.contextTime; usedOutputTs = true; }
            }
         } catch {}
         // getOutputTimestamp already accounts for output latency; only compensate on fallback path
         if (!usedOutputTs) {
            let lat = 0;
            try { lat = self.audio.outputLatency || self.audio.baseLatency || 0; } catch {}
            if (lat) now -= lat * 0.5;
         }
         return self.position + (now - self.started) * self.playbackRate;
      };

      this.play = function play(wait = 0) {
         if (self.audio.state == "suspended") {
            self.audio.resume();
         }
         self.source = self.audio.createBufferSource();
         self.source.playbackRate.value = self.playbackRate;
         self.source.buffer = self.decoded;
         self.source.connect(self.gain);
         self.started = self.audio.currentTime;
         if (wait > 0) {
            self.position = -wait / 1000;
            self.source.start(
               self.audio.currentTime + wait / 1000 / self.playbackRate,
               0
            );
         } else {
            self.source.start(0, self.position);
         }
         self.playing = true;
      };

      // return value true: success
       this.pause = function pause() {
          if (!self.playing) return false;
          // use _getPosition for latency-accurate position
         self.position = self._getPosition();
         self.source.stop();
         self.playing = false;
         return true;
      };

      this.seekforward = function seekforward(time) {
         let offSet = time;
         if (offSet > self.audio.currentTime - self.started) {
            self.position = offSet;
            self.source.stop();
            self.source = self.audio.createBufferSource();
            self.source.playbackRate.value = self.playbackRate;
            self.source.buffer = self.decoded;
            self.source.connect(self.gain);
            self.source.start(0, self.position);
            self.started = self.audio.currentTime;
            self.playing = true;
            return true;
         } else {
            return false;
         }
      };
   }

   export default OsuAudio;
