class TalkRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const sound = inputs[0]?.[0];
    if (sound !== undefined) this.port.postMessage(sound.slice(0));
    return true;
  }
}

registerProcessor("talk-recorder", TalkRecorder);
