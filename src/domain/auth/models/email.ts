export class EmailAddress {
  value: string;

  constructor(email: string) {
    this.validateEmail(email);

    this.value = email;
  }

  private validateEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    const regex =
      /^((?:[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]|(?<=^|\.)"|"(?=$|\.|@)|(?<=".*)[ .](?=.*")|(?<!\.)\.){1,64})(@)((?:[A-Za-z0-9.-])*(?:[A-Za-z0-9])\.(?:[A-Za-z0-9]){2,})$/g;

    const result = regex.test(trimmed);

    if (!result) throw new EmailAddressError(email);
  };

  toString = (): string => this.value;
}

class EmailAddressError extends Error {
  constructor(invalidEmail: string) {
    super(`${invalidEmail} is not a valid email address!`);
    this.name = "EmailAddressError";
    Object.setPrototypeOf(this, EmailAddressError.prototype);
  }
}
