export const VIDEO_FPS = 30;
export const VIDEO_LIMIT = 60;

function verifyVideoTrack(blob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const error = new Error('文件没有可播放的画面，请试试标准画质');
    const finish = failure => {
      clearTimeout(timer);
      video.onloadedmetadata = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (failure) reject(failure);
      else resolve();
    };
    const timer = setTimeout(() => finish(error), 5000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight ? null : error);
    video.onerror = () => finish(error);
    video.src = url;
  });
}

export async function startVideoCapture(K, source, quality, background, audioTrack, signal) {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建视频画布');
  const paint = () => {
    K.paintExportBackground(context, output.width, output.height, background);
    context.drawImage(source, 0, 0);
  };
  paint();
  signal.throwIfAborted();
  if (window.VideoEncoder && window.VideoFrame && (!audioTrack || window.AudioEncoder)) {
    try {
      const codec = await import('../../common/vendor/mediabunny-1.61.0.esm.js');
      const recording = await encodeLiveFrames(K, codec, output, paint, quality, audioTrack, signal);
      if (recording) return recording;
    } catch (error) {
      signal.throwIfAborted();
      console.warn('逐帧录制不可用，尝试浏览器录制', error);
    }
  }
  signal.throwIfAborted();
  return recordCanvasStream(K, output, paint, quality, audioTrack);
}

async function encodeLiveFrames(K, codec, canvas, paint, quality, audioTrack, signal) {
  const audioSettings = audioTrack?.getSettings();
  for (const format of K.canvasVideoEncodings) {
    signal.throwIfAborted();
    const audioCodec = format.container === 'mp4' ? 'aac' : 'opus';
    const bitrate = new codec.Quality({ bitrate: quality.videoBitrate });
    if (!await codec.canEncodeVideo(format.codec, {
      width: canvas.width, height: canvas.height, frameRate: VIDEO_FPS, quality: bitrate, latencyMode: 'realtime',
    })) continue;
    if (audioTrack && !await codec.canEncodeAudio(audioCodec, {
      numberOfChannels: audioSettings.channelCount || 2, sampleRate: audioSettings.sampleRate || 48000, bitrate: 128000,
    })) continue;
    signal.throwIfAborted();
    const output = new codec.Output({
      format: format.container === 'mp4' ? new codec.Mp4OutputFormat({ fastStart: 'in-memory' }) : new codec.WebMOutputFormat(),
      target: new codec.BufferTarget(),
    });
    try {
      const video = new codec.CanvasSource(canvas, { codec: format.codec, quality: bitrate, latencyMode: 'realtime' });
      const audio = audioTrack ? new codec.MediaStreamAudioTrackSource(audioTrack, { codec: audioCodec, bitrate: 128000 }) : null;
      output.addVideoTrack(video, { frameRate: VIDEO_FPS });
      if (audio) output.addAudioTrack(audio);
      const audioError = audio?.errorPromise;
      const wait = task => K.awaitExportTask(audioError ? Promise.race([task, audioError]) : task, signal);
      await wait(output.start());
      paint();
      const started = performance.now();
      await wait(video.add(0, 1 / VIDEO_FPS, { keyFrame: true }));
      return liveEncoderSession(output, video, audioError, audio, format, canvas, paint, started);
    } catch (error) {
      await output.cancel().catch(() => {});
      signal.throwIfAborted();
      console.warn('录制编码器不可用', format.codec, error);
    }
  }
  return null;
}

function liveEncoderSession(output, video, audioError, audio, format, canvas, paint, started) {
  let stopping = false, pending, frameError, previous = 0;
  let resolve, reject;
  const result = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  const stop = (save, error) => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
        audio?.close();
        await pending;
        if (error || frameError) throw error || frameError;
        if (!save) {
          await output.cancel();
          resolve(null);
          return;
        }
        await output.finalize();
        const blob = new Blob([output.target.buffer], { type: 'video/' + format.container });
        await verifyVideoTrack(blob);
        resolve({ blob, extension: format.extension });
      } catch (failure) {
        await output.cancel().catch(() => {});
        reject(failure);
      } finally {
        canvas.width = canvas.height = 1;
      }
    })();
  };
  audioError?.catch(error => stop(false, error));
  return {
    result,
    frame(now) {
      const time = (now - started) / 1000;
      if (stopping || pending || time - previous < 1 / VIDEO_FPS - .001) return;
      paint();
      const keyFrame = Math.floor(time / 2) > Math.floor(previous / 2);
      previous = time;
      pending = video.add(time, 1 / VIDEO_FPS, { keyFrame }).catch(error => {
        frameError = error;
        stop(false, error);
      }).finally(() => { pending = null; });
    },
    stop,
  };
}

function recordCanvasStream(K, output, paint, quality, audioTrack) {
  if (!output.captureStream || !window.MediaRecorder) throw new Error('当前浏览器不支持录制互动视频');
  const mimeTypes = K.videoExportFormats().map(format => {
    if (!audioTrack || !format.mimeType.includes(';codecs=')) return format.mimeType;
    return format.mimeType + (format.extension === 'mp4' ? ',mp4a.40.2' : ',opus');
  });
  let stream = output.captureStream(0);
  let track = stream.getVideoTracks()[0];
  if (!track?.requestFrame) {
    for (const oldTrack of stream.getTracks()) oldTrack.stop();
    stream = output.captureStream(VIDEO_FPS);
    track = stream.getVideoTracks()[0];
  }
  if (!track) throw new Error('无法读取立绘画面');
  const paintFrame = () => {
    paint();
    track.requestFrame?.();
  };

  let recorder, lastError;
  const release = () => {
    track.stop();
    output.width = output.height = 1;
  };
  try {
    if (audioTrack) stream.addTrack(audioTrack);
    for (const mimeType of mimeTypes) {
      if (!MediaRecorder.isTypeSupported(mimeType)) continue;
      try {
        const candidate = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: quality.videoBitrate });
        candidate.start(1000);
        recorder = candidate;
        break;
      } catch (error) { lastError = error; }
    }
    if (!recorder) throw lastError || new Error('没有可用的视频编码器');
  } catch (error) {
    release();
    throw error;
  }

  const chunks = [];
  let keep = true, stopping = false, settled = false, stopTimer;
  let finish;
  const result = new Promise((resolve, reject) => {
    finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(stopTimer);
      recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
      release();
      if (error) reject(error);
      else if (!keep) resolve(null);
      else {
        const type = recorder.mimeType || chunks[0]?.type;
        const blob = new Blob(chunks, { type });
        if (blob.size) {
          const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
          verifyVideoTrack(blob).then(() => resolve({ blob, extension }), reject);
        } else reject(new Error('没有录到画面，请录制一小段再保存'));
      }
    };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => finish();
    recorder.onerror = event => finish(event.error || new Error('视频编码失败'));
  });

  let nextFrame = 0;
  return {
    result,
    frame(now) {
      if (stopping || settled || now < nextFrame - 1) return;
      nextFrame = now + 1000 / VIDEO_FPS;
      paintFrame();
    },
    stop(save) {
      if (stopping || settled) return;
      stopping = true;
      keep = save;
      stopTimer = setTimeout(() => finish(new Error('视频保存超时，请重试')), 8000);
      try { if (recorder.state !== 'inactive') recorder.stop(); }
      catch (error) { finish(error); }
    },
  };
}
