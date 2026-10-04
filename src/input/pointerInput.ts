import { Emitter } from '../core/emitter';

export interface PointerEvents {
  drag: { dx: number; dy: number };
  zoom: { factor: number };
  /** Any deliberate user interaction, used to pause automatic camera motion. */
  interact: void;
}

/** Translates raw pointer, touch and wheel events on an element into device-independent gestures. */
export class PointerInput extends Emitter<PointerEvents> {
  private readonly pointers = new Map<number, [number, number]>();
  private pinchDistance = 0;
  private readonly abort = new AbortController();

  constructor(private readonly target: HTMLElement) {
    super();
    const opts = { signal: this.abort.signal };
    target.addEventListener('pointerdown', this.onDown, opts);
    target.addEventListener('pointerup', this.onUp, opts);
    target.addEventListener('pointercancel', this.onUp, opts);
    target.addEventListener('pointermove', this.onMove, opts);
    target.addEventListener('wheel', this.onWheel, { ...opts, passive: false });
  }

  dispose(): void {
    this.abort.abort();
  }

  private onDown = (e: PointerEvent): void => {
    this.target.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    this.emit('interact', undefined);
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchDistance = 0;
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev[0];
    const dy = e.clientY - prev[1];
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (this.pinchDistance > 0 && d > 0) this.emit('zoom', { factor: this.pinchDistance / d });
      this.pinchDistance = d;
    } else {
      this.emit('drag', { dx, dy });
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.emit('zoom', { factor: 1 + e.deltaY * 0.001 });
    this.emit('interact', undefined);
  };
}
