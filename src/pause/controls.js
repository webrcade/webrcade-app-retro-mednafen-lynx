import React from 'react';

import { ControlsTab } from '@webrcade/app-common';

export class GamepadControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {[
          this.renderControl('start', 'Lynx Pause'),
          this.renderControl('dpad', 'Move'),
          this.renderControl('lanalog', 'Move'),
          this.renderControl('b', 'A'),
          this.renderControl('x', 'A'),
          this.renderControl('a', 'B'),
          this.renderControl('y', 'B'),
          this.renderControl('lbump', 'Option 1'),
          this.renderControl('rbump', 'Option 2'),
        ]}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {[
          this.renderKey('Enter', 'Lynx Pause'),
          this.renderKey('ArrowUp', 'Up'),
          this.renderKey('ArrowDown', 'Down'),
          this.renderKey('ArrowLeft', 'Left'),
          this.renderKey('ArrowRight', 'Right'),
          this.renderKey('KeyX', 'A'),
          this.renderKey('KeyA', 'A'),
          this.renderKey('KeyZ', 'B'),
          this.renderKey('KeyS', 'B'),
          this.renderKey('KeyQ', 'Option 1'),
          this.renderKey('KeyW', 'Option 2'),
        ]}
      </>
    );
  }
}
