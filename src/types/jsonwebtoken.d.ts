declare module "jsonwebtoken" {
  export interface JwtPayload {
    [key: string]: any;
    exp?: number;
    iat?: number;
    sub?: string;
    id?: string;
    email?: string;
  }

  export interface SignOptions {
    algorithm?: string;
    expiresIn?: string | number;
  }

  export interface VerifyOptions {
    algorithms?: string[];
  }

  export function sign(payload: string | Buffer | object, secretOrPrivateKey: string, options?: SignOptions): string;
  export function verify(token: string, secretOrPublicKey: string, options?: VerifyOptions): JwtPayload;
}
