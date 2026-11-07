/** Keyboard/mouse state. Bindings are data so they can be made user-configurable later. */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  // Ctrl is the classic crouch key; C is offered too because browsers reserve Ctrl+W outside fullscreen.
  crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
  interact: ['KeyE'],
  flashlight: ['KeyF'],
  ability: ['KeyQ'],
  journal: ['Tab'],
  radio: ['KeyT'],
  ghostVoice: ['Digit1'],
  ghostApparition: ['Digit2'],
  ghostBlackout: ['Digit3'],
  ghostEcho: ['Digit4'],
  ghostHunt: ['KeyR'],
} as const;

export type Action = keyof typeof BINDINGS;

const down = new Set<string>();

export const isDown = (a: Action) => BINDINGS[a].some((k) => down.has(k));
export const matches = (a: Action, code: string) => (BINDINGS[a] as readonly string[]).includes(code);

export const mouse = { dx: 0, dy: 0 };

let installed = false;
export function installInput() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    down.add(e.code);
    // keep Tab / Ctrl+key combos from leaving the game while pointer-locked
    if (document.pointerLockElement && (e.code === 'Tab' || e.ctrlKey)) e.preventDefault();
    if (e.code === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  window.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
}

export function consumeMouse() {
  const d = { dx: mouse.dx, dy: mouse.dy };
  mouse.dx = 0;
  mouse.dy = 0;
  return d;
}

export async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen();
    const kb = (navigator as unknown as { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
    await kb?.lock?.(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'Tab']);
  } catch {
    /* fullscreen is optional */
  }
}

/** requestPointerLock returns a promise in modern browsers; failures (no user gesture, iframe) are harmless. */
export function lockPointer(el: Element | null | undefined) {
  try {
    const r = (el as HTMLElement | null)?.requestPointerLock?.() as unknown as Promise<void> | undefined;
    r?.catch?.(() => undefined);
  } catch {
    /* ignore */
  }
}
