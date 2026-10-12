let ctx: AudioContext | null = null;

/** Short tones so an operator working on several devices hears the result without looking. */
export function chime(kind: "ok" | "fail"): void {
  try {
    ctx ??= new AudioContext();
    const notes = kind === "ok" ? [660, 880] : [330, 220];
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const start = ctx!.currentTime + i * 0.16;
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  } catch {
    /* Audio is optional. */
  }
}
