/**
 * AudioWorklet Processor: 将麦克风输入实时转换为 16kHz 16-bit PCM 帧
 * 每积累 4096 个 16kHz 采样（约 256ms）就发送一帧给主线程
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetSampleRate = 16000;
    this._inputSampleRate = sampleRate; // AudioWorklet 全局变量
    this._ratio = this._inputSampleRate / this._targetSampleRate;
    this._frameSize = 4096; // 16kHz 下约 256ms
    this._accumulated = 0;
    this._resampleBuf = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Float32Array, mono

    // 简单线性重采样到 16kHz
    for (let i = 0; i < channelData.length; i++) {
      const srcIdx = i * this._ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      const next = idx + 1 < channelData.length ? channelData[idx + 1] : channelData[idx];
      const sample = channelData[idx] * (1 - frac) + next * frac;
      this._resampleBuf.push(sample);
    }

    // 当积累够一帧时发送
    while (this._resampleBuf.length >= this._frameSize) {
      const frame = this._resampleBuf.splice(0, this._frameSize);
      // 转换为 Int16 PCM
      const pcm = new Int16Array(frame.length);
      for (let i = 0; i < frame.length; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
