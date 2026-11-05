import type { MemberRepository } from "../../../membership/domain/member";
import type { MemberDirectory } from "../../domain/ports/member-directory";

export class MembershipMemberDirectory implements MemberDirectory {
  constructor(private readonly members: MemberRepository) {}

  async exists(memberId: string): Promise<boolean> {
    return (await this.members.findById(memberId)) !== null;
  }
}
