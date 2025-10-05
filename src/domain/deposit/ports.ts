import type { ID } from "../shared/id";
import type { CreateDepositRequest, Deposit } from "./models/deposit";

export interface DepositRepository {
  insertDeposit(req: CreateDepositRequest): Promise<Deposit>;
  fetchDeposits(memberId: ID): Promise<Deposit[]>;
}
