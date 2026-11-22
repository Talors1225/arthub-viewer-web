/* Shared sound level for BD2's portrait viewers. */
(() => {
  'use strict';
  const store = window.SpineKit.Store('bd2-audio');
  const read = () => {
    const value = store.get('volume', 1);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  };

  function mount(parent, onChange) {
    const label = document.createElement('label');
    label.className = 'bd2-volume';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.setAttribute('aria-label', '音量');
    const value = document.createElement('span');
    const update = () => {
      value.textContent = input.value + '%';
      input.setAttribute('aria-valuetext', value.textContent);
    };
    input.value = String(Math.round(read() * 100));
    update();
    input.addEventListener('input', () => {
      const level = input.valueAsNumber / 100;
      store.set('volume', level);
      update();
      onChange(level);
    });
    label.append('音量', input, value);
    parent.append(label);
  }

  window.ArtHubBd2Volume = { read, mount };
})();
