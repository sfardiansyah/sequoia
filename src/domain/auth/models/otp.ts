export class OTPCode {
  code: string;

  constructor(code: string) {
    this.code = code;
  }

  static generate = (length: number = 6): OTPCode => {
    const digits = "0123456789";
    const randomValues = new Uint8Array(length);

    crypto.getRandomValues(randomValues);

    let result = "";
    randomValues.forEach(
      (val) => (result += digits.charAt(val % digits.length)),
    );

    return new this(result);
  };
}

export class OTP {
  code: OTPCode;
  type: OTPType;
  expiresAt: Date;

  constructor(type: OTPType = OTPType.Register, expiresAt?: Date) {
    this.code = OTPCode.generate();
    this.type = type;
    this.expiresAt = expiresAt || this.generateExpiryDate(30);
  }

  private generateExpiryDate = (minutes: number): Date => {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);

    return expiresAt;
  };

  validateExpiry = (): void => {
    if (this.expiresAt < new Date()) {
      throw new OTPExpiredError(); // TODO: Define OTP Validation Error
    }
  };
}

class OTPExpiredError extends Error {
  constructor() {
    super("OTP expired!");
    this.name = "OTPExpiredError";
    Object.setPrototypeOf(this, OTPExpiredError.prototype);
  }
}

export class OTPInvalidError extends Error {
  constructor() {
    super("Invalid OTP!");
    this.name = "OTPInvalidError";
    Object.setPrototypeOf(this, OTPInvalidError.prototype);
  }
}

export enum OTPType {
  Register,
}
