const opusBundle = new URL('./vendor/ogg-opus-decoder-1.7.5.min.js', import.meta.url).href;
let opusDecoderPromise;

function loadOpusDecoder() {
  opusDecoderPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = opusBundle;
    script.charset = 'UTF-8';
    script.onload = () => {
      const Decoder = globalThis['ogg-opus-decoder']?.OggOpusDecoder;
      if (typeof Decoder === 'function') resolve(Decoder);
      else reject(new Error('Opus 音频解码器不可用'));
    };
    script.onerror = () => reject(new Error('无法加载 Opus 音频解码器'));
    document.head.append(script);
  }).catch(error => {
    opusDecoderPromise = undefined;
    throw error;
  });
  return opusDecoderPromise;
}

function isOggOpus(data) {
  if (data.length < 36 || data[0] !== 0x4f || data[1] !== 0x67 || data[2] !== 0x67 || data[3] !== 0x53) return false;
  // The identification packet starts after the first page's lacing table.
  const packet = 27 + data[26];
  return 'OpusHead'.split('').every((letter, index) => data[packet + index] === letter.charCodeAt(0));
}

export async function decodePortraitAudio(context, bytes) {
  try {
    // decodeAudioData detaches its input even when it cannot decode the format.
    return await context.decodeAudioData(bytes.slice(0));
  } catch (error) {
    const data = new Uint8Array(bytes);
    if (!isOggOpus(data)) throw error;
    const Decoder = await loadOpusDecoder();
    const decoder = new Decoder();
    await decoder.ready;
    try {
      const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(data);
      if (!samplesDecoded || !channelData.length) throw new Error('Opus 文件没有可播放的音频');
      const buffer = context.createBuffer(channelData.length, samplesDecoded, sampleRate);
      channelData.forEach((samples, index) => buffer.copyToChannel(samples, index));
      return buffer;
    } finally {
      decoder.free();
    }
  }
}
