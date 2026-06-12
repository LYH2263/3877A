type AuthEvent = "session-expired";

type Listener = (event: AuthEvent) => void;

const listeners = new Set<Listener>();

export function emitAuthEvent(event: AuthEvent) {
  listeners.forEach((listener) => {
    listener(event);
  });
}

export function subscribeAuthEvent(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
