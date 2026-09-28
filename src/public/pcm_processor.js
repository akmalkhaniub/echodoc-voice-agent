/**
 * AudioWorkletProcessor for high-performance, zero-jank 16kHz Linear PCM conversion.
 * Runs in a dedicated Web Audio rendering thread off the main UI thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        // Convert Float32Array (-1.0 to 1.0) to 16-bit signed Linear PCM (s16le)
        const pcmBuffer = new ArrayBuffer(channelData.length * 2);
        const view = new DataView(pcmBuffer);

        for (let i = 0; i < channelData.length; i++) {
          const s = Math.max(-1, Math.min(1, channelData[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        // Post the buffer directly (with transferable ArrayBuffer for zero-copy)
        // Also send raw float slice for visualizer
        this.port.postMessage({
          pcm: pcmBuffer,
          floatData: channelData.slice()
        }, [pcmBuffer]);
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
