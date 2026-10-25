/** 本地存储适配层：最高分等。所有调用 try/catch 包裹，存储不可用时降级为内存。 */

const KEY_BEST = 'stack-tower-best';

let memoryFallback: number | null = null;

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(KEY_BEST);
    return raw !== null ? Number.parseInt(raw, 10) || 0 : 0;
  } catch {
    return memoryFallback ?? 0;
  }
}

export function saveBest(score: number): void {
  memoryFallback = score;
  try {
    localStorage.setItem(KEY_BEST, String(score));
  } catch {
    /* 无痕模式等场景下仅保留内存值 */
  }
}
