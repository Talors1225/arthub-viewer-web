// Incremental RGBA PNG encoding. Only one horizontal band and small render
// tiles are retained; the final image never needs a full-size browser canvas.

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
const check = signal => { if (signal?.aborted) throw new DOMException('已取消导出', 'AbortError'); };
function chunk(type, data) {
  const out = new Uint8Array(data.length + 12), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[i + 4] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < out.length - 4; i++) crc = crcTable[(crc ^ out[i]) & 255] ^ crc >>> 8;
  view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
  return out;
}

export async function encodePNG({ width, height, readTile, signal, onProgress,
  tileEdge = 2048, bandBytes = 32 * 1024 * 1024, compression = 'auto' }) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 0x7fffffff)) throw new Error('PNG 尺寸无效');
  check(signal);
  const stride = width * 4;
  if (stride + 1 > bandBytes) throw Object.assign(new Error('单行像素过多，请选择自动适配或减小自定义尺寸'), { code: 'PNG_ALLOCATION_FAILED' });
  const bandRows = Math.max(1, Math.min(512, Math.floor(bandBytes / (stride + 1))));
  const tileWidth = Math.max(1, Math.min(2048, Math.floor(tileEdge)));
  const header = new Uint8Array(13), hv = new DataView(header.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height); header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('sRGB', new Uint8Array([0]))];
  // A PNG has one continuous zlib datastream, including across IDAT boundaries.
  // Prefer the browser codec. The bundled compressor's compressed streaming
  // mode can emit invalid back-references for some short RGBA scanlines.
  // Its stored-block mode is a portable fallback with no LZ back-references.
  let writer, pump, stream, compressionError, method = 'compatibility-stream', finished = false;
  if (compression !== 'stored' && typeof CompressionStream === 'function') {
    const native = new CompressionStream('deflate'); writer = native.writable.getWriter();
    const reader = native.readable.getReader(); method = 'native-stream';
    pump = (async () => { while (true) { const { value, done } = await reader.read(); if (done) break; if (value.length) parts.push(chunk('IDAT', value)); } })();
    pump.catch(error => { compressionError = error; writer.abort(error).catch(() => {}); });
  } else {
    const { Zlib } = await import('./vendor/fflate-0.8.3.mjs');
    stream = new Zlib({ level: 0 }, data => { if (data.length) parts.push(chunk('IDAT', data)); });
  }
  let tiles = 0, encodedRows = 0, lastYield = Date.now();
  let band, row;
  const progress = async (force = false) => {
    check(signal);
    if (force || Date.now() - lastYield > 40) {
      if (onProgress) await onProgress(encodedRows / height);
      else await new Promise(resolve => setTimeout(resolve, 0));
      lastYield = Date.now(); check(signal);
    }
  };
  try {
    band = new Uint8Array(stride * Math.min(bandRows, height)); row = new Uint8Array(stride + 1);
    for (let y = 0; y < height; y += bandRows) {
      const rows = Math.min(bandRows, height - y);
      for (let x = 0; x < width; x += tileWidth) {
        check(signal);
        const tile = { x, y, width: Math.min(tileWidth, width - x), height: rows };
        // The renderer is consumed synchronously before WebGL can clear its buffer.
        const pixels = readTile(tile);
        if (!pixels || pixels.length !== tile.width * rows * 4) throw new Error('PNG 分块像素不完整');
        const tileStride = tile.width * 4;
        for (let i = 0; i < rows; i++) band.set(pixels.subarray(i * tileStride, (i + 1) * tileStride), i * stride + x * 4);
        tiles++; await progress();
      }
      for (let i = 0; i < rows; i++) {
        check(signal); row[0] = 1; // PNG Sub filter, fully reversible for RGBA8.
        const offset = i * stride;
        for (let j = 0; j < stride; j++) row[j + 1] = band[offset + j] - (j >= 4 ? band[offset + j - 4] : 0);
        if (compressionError) throw compressionError;
        if (writer) await writer.write(row.slice()); else stream.push(row, false);
        encodedRows++; await progress();
      }
    }
    if (writer) { await writer.close(); await pump; } else stream.push(new Uint8Array(0), true);
    parts.push(chunk('IEND', new Uint8Array(0)));
    await progress(true);
    const blob = new Blob(parts, { type: 'image/png' });
    finished = true;
    return { blob, width, height, tiles, method, peakRawBytes: band.byteLength + row.byteLength };
  } finally {
    if (writer && !finished) { await writer.abort().catch(() => {}); await pump.catch(() => {}); }
    band = row = null;
  }
}
