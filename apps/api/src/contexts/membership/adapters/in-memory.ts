import type { IdGenerator } from "../application/admit-member";
import type { Member, MemberRepository } from "../domain/member";

export class InMemoryMemberRepository implements MemberRepository {
  private readonly byOwner = new Map<string, Member>();

  async findByOwnerPkh(ownerPkh: string): Promise<Member | null> {
    return this.byOwner.get(ownerPkh) ?? null;
  }

  async save(member: Member): Promise<void> {
    this.byOwner.set(member.ownerPkh, member);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private nextId = 1;

  next(): string {
    return `member-${this.nextId++}`;
  }
}
