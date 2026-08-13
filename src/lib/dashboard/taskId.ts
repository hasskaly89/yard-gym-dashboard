// Tasks are regenerated nightly from AI output with no stable id. This
// derives a deterministic key from (scope, title, source) so the same task
// re-surfacing tomorrow still matches its complete/snooze state — as long as
// the AI phrases it the same way. Shared between server (API) and client (UI)
// so both compute the identical id.
export function taskId(scope: string, title: string, source: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${scope}::${norm(title)}::${norm(source)}`;
}
