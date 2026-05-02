/**
 * AudioWorklet Processor: 将麦克风输入实时转换为 16kHz 16-bit PCM 帧
 * 每积累 640 个 16kHz 采样（40ms）就发送一帧给主线程，符合讯飞 IAT 要求
 *
 * 重要：不依赖 AudioWorklet 全局 sampleRate 变量（Chrome 可能忽略 AudioContext 的 sampleRate 参数）
 * 改为从主线程通过 postMessage({ type: 'init', sampleRate }) 传入实际采样率
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._targetSampleRate = 16000;
    // 先用全局 sampleRate 作为初始值，主线程会发消息覆盖
    this._inputSampleRate = sampleRate;
    this._ratio = this._inputSampleRate / this._targetSampleRate;
    // 目标帧大小：40ms @ 16kHz = 640 个样本 = 1280 字节（讯飞推荐帧大小）
    this._targetFrameSamples = 640;
    this._resampleBuf = [];

    // 接收主线程发来的实际采样率
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'init') {
        this._inputSampleRate = e.data.sampleRate;
        this._ratio = this._inputSampleRate / this._targetSampleRate;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0]; // Float32Array, mono

    // 线性重采样到 16kHz
    if (Math.abs(this._ratio - 1.0) < 0.001) {
      // 采样率已经是 16kHz，直接复制
      for (let i = 0; i < channelData.length; i++) {
        this._resampleBuf.push(channelData[i]);
      }
    } else {
      // 降采样（如 48kHz → 16kHz，ratio ≈ 3）
      const outputLength = Math.floor(channelData.length / this._ratio);
      for (let i = 0; i < outputLength; i++) {
        const srcIdx = i * this._ratio;
        const idx = Math.floor(srcIdx);
        const frac = srcIdx - idx;
        const next = idx + 1 < channelData.length ? channelData[idx + 1] : channelData[idx];
        const sample = channelData[idx] * (1 - frac) + next * frac;
        this._resampleBuf.push(sample);
      }
    }

    // 当积累够 640 个样本（40ms @ 16kHz）时发送一帧
    while (this._resampleBuf.length >= this._targetFrameSamples) {
      const frame = this._resampleBuf.splice(0, this._targetFrameSamples);
      // 转换为 Int16 PCM（小端序）
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
