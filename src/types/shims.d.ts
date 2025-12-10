declare module "cors";

declare global {
  namespace Express {
    interface Request {
      user?: import("../lib/auth").AuthUser;
    }
  }
}

export {};
