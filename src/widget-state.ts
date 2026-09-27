import type { NotificationState } from './notification-state';
/** Presentation metadata only. Caller must pass independently validated selector
 * coverage from notificationState. The boolean applies to date, not forever.
 * Native clients must compare their local day against the inclusive window. */
export function widgetState(state: NotificationState, name: string) {
  if (!name || name.length > 79) throw Error('Invalid widget name');
  return { pack: state.pack, name, date: state.builtOn, roundReady: true, builtOn: state.builtOn, readyThrough: state.readyThrough };
}
/** Device-local state only; no score/history/token leaves the app. Pages without
 * the injected native bridge do nothing. Completion uses this daily date's saved
 * record, so opening Stats/practice cannot mark a round complete. */
export function nativeWidgetUpdate(pack: string): string {
  if (!/^[a-z0-9-]+$/.test(pack)) throw Error('Invalid widget pack');
  return `try{if(window.ScorewitNativeWidget&&typeof window.ScorewitNativeWidget.update==='function'){Promise.resolve(window.ScorewitNativeWidget.update({pack:${JSON.stringify(pack)},date:currentDailyKey(),completed:!!loadHistory()[currentDailyKey()]})).catch(function(){});}}catch{}`;
}
