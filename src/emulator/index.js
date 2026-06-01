import {
  ScriptAudioProcessor,
  DisplayLoop,
  RetroAppWrapper,
  LOG
} from '@webrcade/app-common';

export class Emulator extends RetroAppWrapper {

  GAME_SRAM_NAME = 'game.srm';
  SAVE_NAME = 'sav';

  CART_NO_ROTATE = 0;
  CART_ROTATE_LEFT =	1;
  CART_ROTATE_RIGHT =	2;

  constructor(app, debug = false) {
    super(app, debug);
    this.lastFrequency = 75;
    this.frequency = 75;
    this.rotation = -1;
    window.emulator = this;

    this.audioStarted = 0;

    // Fractional sample carry (for 800.25)
    this.audioCarry = 0;

    this.total = 0;
    this.count = 0;

    this.audioCallback = (offset, length) => {
      // length = incoming frames (mono)
      //this.total += length;
      this.count++;

      // ---- target frames this callback ----
      const exactFrames = 44115 / this.frequency;
      const framesWithCarry = exactFrames + this.audioCarry;
      const outFrames = Math.floor(framesWithCarry);
      this.audioCarry = framesWithCarry - outFrames;

      if (this.count >= this.frequency) {
        //  console.log("frame: " + length + ", exact: " + exactFrames);
        //  console.log("total:", this.total);
        this.total = 0;
        this.count = 0;
      }

      // ---- input samples (stereo interleaved) ----
      const inSamples = length << 1;
      const input = new Int16Array(
        window.Module.HEAP16.buffer,
        offset,
        inSamples
      );

      // ---- output buffer (stereo interleaved) ----
      const outSamples = outFrames << 1;
      const output = new Int16Array(outSamples);

      // ---- frame walking resampler (no timing drift) ----
      const step = length / outFrames;

      let srcFrame = 0;
      for (let i = 0; i < outFrames; i++) {
        const si = (srcFrame | 0) << 1;

        output[i * 2]     = input[si];
        output[i * 2 + 1] = input[si + 1];

        srcFrame += step;
      }

      this.total += (outSamples >> 1);

      this.audioProcessor.storeSoundCombinedInput(
        output,
        2,
        outSamples,
        0,
        32768
      );
    };
  }

  createAudioProcessor() {
    return new ScriptAudioProcessor(
      2,
      44100,
      8192 + 4096,
      2048
    ).setDebug(this.debug);
  }

  getHashFileExtension() {
    return 'lnx';
  }

  onFrame() {
    if (this.audioStarted !== -1) {
      if (this.audioStarted > 1) {
        this.audioStarted = -1;
        // Start the audio processor
        this.audioProcessor.start();
      } else {
        this.audioStarted++;
      }
    }
  }

  sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
    if (this.rotation === this.CART_ROTATE_LEFT || this.rotation === this.CART_ROTATE_RIGHT) {
      const up = input & this.INP_UP;
      const down = input & this.INP_DOWN;
      const left = input & this.INP_LEFT;
      const right = input & this.INP_RIGHT;

      // Clear INP_* direction bits
      input &= ~(this.INP_UP | this.INP_DOWN | this.INP_LEFT | this.INP_RIGHT);

      // Remap based on rotation
      switch (this.rotation) {
        case this.CART_ROTATE_LEFT:
          if (left) input |= this.INP_UP;
          if (down) input |= this.INP_LEFT;
          if (right) input |= this.INP_DOWN;
          if (up) input |= this.INP_RIGHT;
          break;
        case this.CART_ROTATE_RIGHT:
          if (right) input |= this.INP_UP;
          if (up) input |= this.INP_LEFT;
          if (left) input |= this.INP_DOWN;
          if (down) input |= this.INP_RIGHT;
          break;
        default:
          break;
      }
    }

    if (!this.getDisableInput()) {
      window.Module._wrc_set_input(
        controller,
        input,
        analog0x,
        analog0y,
        analog1x,
        analog1y,
      );
    } else {
      window.Module._wrc_set_input(
        controller, 0, 0, 0, 0, 0
      );
    }
  }

  getScriptUrl() {
    return 'js/mednafen_lynx_libretro.js';
  }

  getPrefs() {
    return this.prefs;
  }

  async saveState() {
    const { saveStatePath, started } = this;
    const { FS, Module } = window;

    try {
      if (!started) {
        return;
      }

      // Save to files
      Module._cmd_savefiles();

      let path = '';
      const files = [];
      let s = null;

      path = `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`;
      LOG.info('Checking: ' + path);
      try {
        s = FS.readFile(path);
        if (s) {
          LOG.info('Found save file: ' + path);
          files.push({
            name: this.SAVE_NAME,
            content: s,
          });
        }
      } catch (e) {}

      if (files.length > 0) {
        if (await this.getSaveManager().checkFilesChanged(files)) {
          await this.getSaveManager().save(
            saveStatePath,
            files,
            this.saveMessageCallback,
          );
        }
      } else {
        await this.getSaveManager().delete(path);
      }
    } catch (e) {
      LOG.error('Error persisting save state: ' + e);
    }
  }

  async loadState() {
    const { saveStatePath } = this;
    const { FS } = window;

    // Write the save state (if applicable)
    try {
      // Load
      const files = await this.getSaveManager().load(
        saveStatePath,
        this.loadMessageCallback,
      );

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.name === this.SAVE_NAME) {
            LOG.info(`writing ${this.GAME_SRAM_NAME} file`);
            FS.writeFile(
              `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`,
              f.content,
            );
          }
        }

        // Cache the initial files
        await this.getSaveManager().checkFilesChanged(files);
      }
    } catch (e) {
      LOG.error('Error loading save state: ' + e);
    }
  }

  isEscapeHackEnabled() {
    return false;
  }

  async applyGameSettings() {
  }

  isForceAspectRatio() {
    return false;
  }

  setRefreshRate(rate) {
    if (rate !== this.frequency) {
      this.frequency = rate;
    }
  }

  getDisplayLoopReturn() {
    if (this.lastFrequency !== this.frequency) {
      this.lastFrequency = this.frequency;
      console.log('returning: ' + this.frequency);
      return this.frequency;
    }
    return undefined;
  }

  onSetRotation(rotation) {
    console.log("On set rotation: " + rotation);

    const rotValue = this.getProps().rotation;
    if (rotValue !== undefined) {
      if (rotValue !== -1) {
        switch (rotValue) {
          case 90:
            rotation = this.CART_ROTATE_RIGHT;
            break;
          case 270:
            rotation = this.CART_ROTATE_LEFT;
            break;
          default:
            rotation = this.CART_NO_ROTATE;
            break;
        }
      }
    }
    console.log("Rotation set to: " + rotation);

    this.rotation = rotation;

    return rotation;
  }

  createDisplayLoop(debug) {
    const loop = new DisplayLoop(
      this.frequency, // frame rate (ignored due to no wait)
      false, // vsync
      debug, // debug
      false,
    );
    // loop.setAdjustTimestampEnabled(false);
    return loop;
  }

  getDefaultAspectRatio() {
    return (this.rotation === this.CART_ROTATE_LEFT || this.rotation === this.CART_ROTATE_RIGHT) ? .6375 : 1.569; // ; // 1.569;
  }

  resizeScreen(canvas) {
    this.canvas = canvas;
    this.updateScreenSize();
  }

  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
}

