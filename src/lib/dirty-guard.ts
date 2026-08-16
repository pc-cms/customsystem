/**
 * dirty-guard — глобальный реестр «грязных» форм.
 *
 * Любая форма, в которой оператор уже ввёл данные, но ещё не сохранил их,
 * регистрируется здесь. Автоматика (chunk-recovery, PWA-обновление) обязана
 * спрашивать `hasDirtyWork()` перед тем, как перезагрузить страницу —
 * иначе кассир теряет несохранённый подсчёт (Chips Check и т.п.).
 */
const dirty = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => { try { l(); } catch { /* noop */ } });

export const setDirty = (key: string, isDirty: boolean) => {
  const had = dirty.has(key);
  if (isDirty) dirty.add(key);
  else dirty.delete(key);
  if (had !== dirty.has(key)) emit();
};

export const clearDirty = (key: string) => setDirty(key, false);

export const hasDirtyWork = () => dirty.size > 0;

export const subscribeDirty = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
