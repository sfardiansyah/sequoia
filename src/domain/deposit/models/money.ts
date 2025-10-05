import Decimal from "decimal.js";

enum Currency {
  IDR,
}

export class Money {
  value: Decimal;
  currency: Currency;

  constructor(n: Decimal.Value, currency: Currency = Currency.IDR) {
    this.value = new Decimal(n);
    this.currency = currency;
  }

  toString = (): string => this.value.toString();
}
