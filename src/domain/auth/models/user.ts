import type { ID } from "../../shared";
import { DuplicateError } from "../ports";
import type { EmailAddress } from "./email";
import type { OTPCode } from "./otp";

export interface User {
  id: ID;
}

export interface RegisterRequestWithOTP {
  otp: OTPCode;
  form: RegisterRequest;
}

export interface RegisterRequest {
  username: string;
  email: EmailAddress;
}

export interface LoginRequest {
  username: string;
  otp: OTPCode;
}

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterError";
    Object.setPrototypeOf(this, RegisterError.prototype);
  }

  static fromError = (error: unknown): RegisterError => {
    if (error instanceof DuplicateError) {
      return new RegisterError("Username or email already registered!");
    }

    process.stdout.write(`Error: ${error}\n`); // TODO: explore logging
    return new RegisterError("Internal Server Error");
  };
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
    Object.setPrototypeOf(this, LoginError.prototype);
  }

  static fromError = (error: unknown): LoginError => {
    if (error instanceof DuplicateError) {
      return new RegisterError("Username or email already registered!");
    }

    process.stdout.write(`Error: ${error}\n`); // TODO: explore logging
    return new RegisterError("Internal Server Error");
  };
}
