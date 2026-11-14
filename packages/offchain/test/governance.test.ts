import { describe, expect, test } from "bun:test";
import vectors from "../../shared/vectors/governance.json";
import {
  MAX_WINDOW_MS,
  choiceCommitment,
  commitmentMatches,
  eligibleLeaf,
  endOfReveal,
  endOfVoting,
  notAfter,
  notBefore,
  nullifier,
  quorumMet,
  thresholdMet,
  timelockEnd,
  windowIsTight,
} from "../src/governance";

describe("governance vectors", () => {
  test("hashes match the shared vectors", () => {
    for (const vector of vectors.leaf) {
      expect(["leaf", vector.leaf]).toEqual(["leaf", eligibleLeaf(vector.secret)]);
    }
    for (const vector of vectors.nullifier) {
      expect(["nullifier", vector.nullifier]).toEqual([
        "nullifier",
        nullifier(vector.secret, vector.proposalId),
      ]);
    }
    for (const vector of vectors.commitment) {
      expect(["commitment", vector.commitment]).toEqual([
        "commitment",
        choiceCommitment(vector.choice, vector.salt),
      ]);
    }
  });

  test("windows match the shared vectors", () => {
    for (const vector of vectors.windows) {
      const end = endOfVoting(vector.start, vector.votingDays);
      const revealEnd = endOfReveal(end, vector.revealDays);
      expect({
        end,
        revealEnd,
        timelockEnd: timelockEnd(vector.finalizedAt, vector.timelockDays),
      }).toEqual({
        end: vector.end,
        revealEnd: vector.revealEnd,
        timelockEnd: vector.timelockEnd,
      });
    }
  });

  test("quorum matches the shared vectors", () => {
    for (const vector of vectors.quorum) {
      expect(
        quorumMet(vector.votes, vector.eligibleCount, vector.quorumBps),
      ).toBe(vector.met);
    }
  });

  test("threshold matches the shared vectors", () => {
    for (const vector of vectors.threshold) {
      expect(thresholdMet(vector.yes, vector.no, vector.thresholdBps)).toBe(
        vector.met,
      );
    }
  });
});

describe("governance rules", () => {
  test("hashes are domain separated", () => {
    const secret = "11".repeat(32);
    const proposalId = "33".repeat(32);
    const salt = "22".repeat(32);
    const other = "44".repeat(32);
    expect(eligibleLeaf(secret)).not.toBe(nullifier(secret, proposalId));
    expect(eligibleLeaf(secret)).not.toBe(choiceCommitment(0, salt));
    expect(nullifier(secret, proposalId)).not.toBe(nullifier(secret, other));
    expect(choiceCommitment(0, salt)).not.toBe(choiceCommitment(1, salt));
    expect(choiceCommitment(1, salt)).not.toBe(choiceCommitment(1, other));
  });

  test("the commitment rejects an unknown choice", () => {
    expect(() => choiceCommitment(3, "22".repeat(32))).toThrow();
  });

  test("hashes reject inputs that are not 32 bytes", () => {
    expect(() => eligibleLeaf("11")).toThrow();
    expect(() => nullifier("11".repeat(32), "aa")).toThrow();
    expect(() => choiceCommitment(0, "22")).toThrow();
  });

  test("the commitment opens with the same choice and salt", () => {
    const commitment = choiceCommitment(2, "22".repeat(32));
    expect(commitmentMatches(commitment, 2, "22".repeat(32))).toBe(true);
    expect(commitmentMatches(commitment, 0, "22".repeat(32))).toBe(false);
  });

  test("time checks use the bound that cannot be faked", () => {
    expect(notBefore(100, 100)).toBe(true);
    expect(notBefore(99, 100)).toBe(false);
    expect(notAfter(100, 100)).toBe(true);
    expect(notAfter(101, 100)).toBe(false);
  });

  test("a create or finalize window is at most one hour", () => {
    expect(windowIsTight(0, MAX_WINDOW_MS)).toBe(true);
    expect(windowIsTight(0, MAX_WINDOW_MS + 1)).toBe(false);
    expect(windowIsTight(100, 99)).toBe(false);
  });

  test("6667 rejects two of three", () => {
    expect(thresholdMet(2, 1, 6667)).toBe(false);
    expect(thresholdMet(3, 1, 6667)).toBe(true);
  });
});
