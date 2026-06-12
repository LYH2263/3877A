export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        sessionId: number;
      };
    }
  }
}
