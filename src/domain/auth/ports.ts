import type { ID } from "../shared";
import type { EmailAddress } from "./models/email";
import type { OTP, OTPCode } from "./models/otp";
import type { RegisterRequest, User } from "./models/user";
import type { JWTPayload, Token } from "./models/token";

export interface AuthRepository {
  getUser(id: ID): Promise<User>;
  getUserByUsername(username: string): Promise<User>;
  insertUser(req: RegisterRequest): Promise<User>;
  insertGeneratedOTP(username: string, otp: OTP): Promise<void>;
  getOTP(username: string, otp: OTPCode): Promise<OTP | undefined>;
  getEmailByUsername(username: string): Promise<EmailAddress>;
}

export interface EmailClient {
  sendOTP(email: EmailAddress, otp: OTPCode): Promise<void>;
}

export interface JWTClient {
  generateToken(userId: ID, minutesToExpire?: number): Promise<Token>;
  verifyToken(token: string): Promise<JWTPayload>;
}

export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
    Object.setPrototypeOf(this, DuplicateError.prototype);
  }
}
