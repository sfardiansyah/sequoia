import { err, ok, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import {
  type Member,
  type MemberRepository,
  type MembershipError,
} from "../domain/member";

export class FindMemberByPkh {
  constructor(private readonly members: MemberRepository) {}

  async execute(
    pkh: string,
  ): Promise<Result<Member, MembershipError>> {
    let member: Member | null;
    try {
      member = await this.members.findByOwnerPkh(pkh);
    } catch (cause) {
      return err(unexpected(cause));
    }

    return member ? ok(member) : err({ code: "MEMBER_NOT_FOUND" });
  }
}
