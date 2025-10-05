import type { ID } from "../shared";
import type { CreateDepositRequest, Deposit } from "./models/deposit";
import type { DepositRepository } from "./ports";

export default class DepositService {
  repository: DepositRepository;

  constructor(repository: DepositRepository) {
    this.repository = repository;
  }

  createDeposit = (req: CreateDepositRequest): Promise<Deposit> =>
    this.repository.insertDeposit(req);

  listDeposits = (memberId: ID): Promise<Deposit[]> =>
    this.repository.fetchDeposits(memberId);
}
