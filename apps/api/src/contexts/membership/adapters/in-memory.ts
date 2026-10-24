import type { IdGenerator } from "../application/admit-member";
import type { Member, MemberRepository } from "../domain/member";
import type { OwnerPkh } from "../domain/owner-pkh";

export class InMemoryMemberRepository implements MemberRepository {
  private readonly byOwner = new Map<string, Member>();

  async findByOwnerPkh(ownerPkh: OwnerPkh): Promise<Member | null> {
    return this.byOwner.get(ownerPkh.value) ?? null;
  }

  async save(member: Member): Promise<void> {
    const existing = this.byOwner.get(member.ownerPkh.value);
    if (existing && existing.id !== member.id) {
      throw new Error(`Duplicate owner pkh: ${member.ownerPkh.value}`);
    }

    this.byOwner.set(member.ownerPkh.value, member);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private nextId = 1;

  next(): string {
    return `member-${this.nextId++}`;
  }
}
