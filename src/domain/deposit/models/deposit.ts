import type { ID } from "../../shared";
import type { Money } from "./money";

export interface Deposit {
  id: ID;
  memberId: ID;
  amount: Money;
  createdAt: Date;
}

export interface CreateDepositRequest {
  memberId: ID;
  amount: Money;
}
