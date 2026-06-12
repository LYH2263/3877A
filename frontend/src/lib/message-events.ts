type MessageEvent = "refresh-unread";

type Listener = (event: MessageEvent) => void;

const listeners = new Set<Listener>();

export function emitMessageEvent(event: MessageEvent) {
  listeners.forEach((listener) => {
    listener(event);
  });
}

export function subscribeMessageEvent(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
