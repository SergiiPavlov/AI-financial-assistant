import { AuthUser } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
