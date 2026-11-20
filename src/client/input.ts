// 조작 → 명령. PC: 마우스 방향 + 왼쪽 클릭/스페이스(부스트) + Shift(살금살금)
// 스킬: E 또는 오른쪽 클릭 / 진화 카드: 1·2·3 키 또는 카드 누르기
// 모바일: 화면 아무 곳이나 끌기(가상 조이스틱) + 부스트·살금·스킬 버튼
import type { Command } from '../shared/types';

export class Input {
  angle = 0;
  boost = false;
  sneak = false;
  readonly touch: boolean;
  private mouseX = 0;
  private mouseY = 0;
  private hasMouse = false;
  private mouseBoost = false;
  private keyBoost = false;
  private keySneak = false;
  private btnBoost = false;
  private btnSneak = false;
  private joy: { id: number; ox: number; oy: number } | null = null;
  private skillSeq = 0;
  private moltSeq = 0;
  private moltChoice = 0;

  skill() {
    this.skillSeq++;
  }

  molt(choice: number) {
    this.moltChoice = choice;
    this.moltSeq++;
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private boostBtn: HTMLElement,
    private sneakBtn: HTMLElement,
    private joyEl: HTMLElement,
    private knobEl: HTMLElement,
    skillBtn: HTMLElement,
  ) {
    this.touch = 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseBoost = true;
        if (e.button === 2) this.skill();
        return;
      }
      if (this.joy) return;
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.joyEl.style.display = 'block';
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.hasMouse = true;
        return;
      }
      if (!this.joy || e.pointerId !== this.joy.id) return;
      const dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) this.angle = Math.atan2(dy, dx);
      const k = Math.min(1, 44 / Math.max(d, 1));
      this.knobEl.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseBoost = false;
        return;
      }
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null;
        this.joyEl.style.display = 'none';
      }
    };
    window.addEventListener('pointerup', endJoy);
    window.addEventListener('pointercancel', endJoy);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.keyBoost = true;
        e.preventDefault();
      }
      if (e.key === 'Shift') this.keySneak = true;
      if (e.repeat) return;
      if (e.code === 'KeyE') this.skill();
      if (e.key === '1' || e.key === '2' || e.key === '3') this.molt(Number(e.key) - 1);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.keyBoost = false;
      if (e.key === 'Shift') this.keySneak = false;
    });
    window.addEventListener('blur', () => {
      this.keyBoost = this.keySneak = this.mouseBoost = this.btnBoost = this.btnSneak = false;
    });

    const hold = (el: HTMLElement, set: (v: boolean) => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        set(true);
        el.classList.add('on');
      });
      const off = () => {
        set(false);
        el.classList.remove('on');
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    hold(boostBtn, (v) => (this.btnBoost = v));
    hold(sneakBtn, (v) => (this.btnSneak = v));
    skillBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skill();
    });
  }

  /** headX, headY: 화면에서 내 머리 위치 */
  update(headX: number, headY: number): Command {
    if (this.hasMouse && !this.joy) {
      const dx = this.mouseX - headX, dy = this.mouseY - headY;
      if (Math.hypot(dx, dy) > 4) this.angle = Math.atan2(dy, dx);
    }
    this.sneak = this.keySneak || this.btnSneak;
    this.boost = !this.sneak && (this.mouseBoost || this.keyBoost || this.btnBoost);
    return { angle: this.angle, boost: this.boost, sneak: this.sneak, skillSeq: this.skillSeq, moltSeq: this.moltSeq, moltChoice: this.moltChoice };
  }

  resetSeq() {
    this.skillSeq = this.moltSeq = 0;
  }

  resetHolds() {
    this.keyBoost = this.keySneak = this.mouseBoost = this.btnBoost = this.btnSneak = false;
  }
}
