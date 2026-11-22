// Some mobile browsers leave media-element volume at 1. Route those players
// through a shared Web Audio gain while keeping their native streaming controls.
export function createMediaVolume(players, initialVolume) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const first = players[0], original = first.volume;
  const test = original === 0.5 ? 0.25 : 0.5;
  first.volume = test;
  const nativeVolume = first.volume === test;
  first.volume = original;

  const connected = new WeakSet();
  let context, output, volume;
  function set(value) {
    volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    if (output) output.gain.value = volume;
    for (const player of players) {
      if (connected.has(player)) continue;
      if (nativeVolume) player.volume = volume;
      else player.muted = volume === 0;
    }
  }
  set(initialVolume);

  function play(player, url) {
    if (!nativeVolume && AudioContext && !connected.has(player)) {
      try {
        if (!output) {
          context = new AudioContext();
          output = context.createGain();
          output.gain.value = volume;
          output.connect(context.destination);
        }
        context.createMediaElementSource(player).connect(output);
        player.crossOrigin = 'anonymous';
        player.muted = false;
        connected.add(player);
      } catch {
        // A browser without a usable audio context can still play the stream.
      }
    }
    if (connected.has(player) && context.state !== 'running') void context.resume().catch(() => {});
    player.src = url;
    return player.play();
  }

  return { get volume() { return volume; }, set, play };
}
