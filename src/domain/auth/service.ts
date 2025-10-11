import { OTP, OTPCode, OTPInvalidError } from "./models/otp";
import { RefreshToken, TokenResponse } from "./models/token";
import {
  LoginError,
  RegisterError,
  type LoginRequest,
  type RegisterRequest,
  type RegisterRequestWithOTP,
  type User,
} from "./models/user";
import type { AuthRepository, EmailClient, JWTClient } from "./ports";
import { ID, InternalServerError } from "../shared";

export class AuthService {
  repository: AuthRepository;
  mailer: EmailClient;
  jwt: JWTClient;

  constructor(repository: AuthRepository, mailer: EmailClient, jwt: JWTClient) {
    this.repository = repository;
    this.mailer = mailer;
    this.jwt = jwt;
  }

  authenticate = async (token: string): Promise<User> => {
    const payload = await this.jwt.verifyToken(token);

    const userId = payload.sub;
    if (!userId) {
      throw new InternalServerError();
    }

    const user = await this.repository.getUser(new ID(userId));

    return user;
  };

  register = async (req: RegisterRequestWithOTP): Promise<TokenResponse> => {
    try {
      this.validateOTP(req.form.username, req.otp);
      const user = await this.repository.insertUser(req.form);

      return await this.generateToken(user);
    } catch (error) {
      throw RegisterError.fromError(error);
    }
  };

  sendRegistrationOTP = async (req: RegisterRequest): Promise<void> => {
    const otp = new OTP();

    await this.repository.insertGeneratedOTP(req.username, otp);
    await this.mailer.sendOTP(req.email, otp.code);
  };

  sendLoginOTP = async (username: string): Promise<void> => {
    const otp = new OTP();

    const email = await this.repository.getEmailByUsername(username);

    await this.repository.insertGeneratedOTP(username, otp);
    await this.mailer.sendOTP(email, otp.code);
  };

  login = async (req: LoginRequest): Promise<TokenResponse> => {
    try {
      this.validateOTP(req.username, req.otp);

      const user = await this.repository.getUserByUsername(req.username);

      return await this.generateToken(user);
    } catch (error) {
      throw LoginError.fromError(error);
    }
  };

  private generateToken = async (user: User): Promise<TokenResponse> => {
    const token = await this.jwt.generateToken(user.id);
    const refreshToken = RefreshToken.generate();

    return new TokenResponse(token, refreshToken);
  };

  private validateOTP = async (
    username: string,
    code: OTPCode,
  ): Promise<void> => {
    const otp = await this.repository.getOTP(username, code);
    if (!otp) {
      throw new OTPInvalidError();
    }

    otp.validateExpiry();
  };
}
