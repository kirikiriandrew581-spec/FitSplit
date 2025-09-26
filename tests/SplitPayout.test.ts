import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CLASS_ID = 101;
const ERR_CLASS_NOT_COMPLETED = 102;
const ERR_INVALID_TOTAL_AMOUNT = 103;
const ERR_INVALID_SPLIT_PERCENTAGE = 104;
const ERR_INVALID_INSTRUCTOR = 105;
const ERR_INVALID_VENUE = 106;
const ERR_INSUFFICIENT_ESCROW = 107;
const ERR_TRANSFER_FAILED = 108;
const ERR_PAYOUT_ALREADY_PROCESSED = 109;
const ERR_INVALID_TIMESTAMP = 110;
const ERR_AUTHORITY_NOT_VERIFIED = 111;
const ERR_INVALID_PLATFORM_FEE = 112;
const ERR_INVALID_PAYOUT_ID = 113;
const ERR_MAX_PAYOUTS_EXCEEDED = 114;
const ERR_INVALID_RECIPIENT = 115;
const ERR_INVALID_CURRENCY = 116;
const ERR_INVALID_STATUS = 117;
const ERR_PAYOUT_NOT_FOUND = 118;
const ERR_INVALID_UPDATE_PARAM = 119;
const ERR_UPDATE_NOT_ALLOWED = 120;

interface Payout {
  classId: number;
  totalAmount: number;
  instructorSplit: number;
  instructorAmount: number;
  venueAmount: number;
  platformAmount: number;
  timestamp: number;
  instructor: string;
  venue: string;
  status: boolean;
}

interface PayoutUpdate {
  updateSplit: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SplitPayoutMock {
  state: {
    contractOwner: string;
    nextPayoutId: number;
    maxPayouts: number;
    platformFee: number;
    escrowContract: string | null;
    registryContract: string | null;
    payouts: Map<number, Payout>;
    payoutsByClass: Map<number, number>;
    payoutUpdates: Map<number, PayoutUpdate>;
  } = {
    contractOwner: "ST1OWNER",
    nextPayoutId: 0,
    maxPayouts: 10000,
    platformFee: 5,
    escrowContract: null,
    registryContract: null,
    payouts: new Map(),
    payoutsByClass: new Map(),
    payoutUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CALLER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  classStatuses: Map<number, boolean> = new Map();
  escrowReleases: Map<number, { classId: number; amount: number }> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      nextPayoutId: 0,
      maxPayouts: 10000,
      platformFee: 5,
      escrowContract: null,
      registryContract: null,
      payouts: new Map(),
      payoutsByClass: new Map(),
      payoutUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CALLER";
    this.stxTransfers = [];
    this.classStatuses = new Map();
    this.escrowReleases = new Map();
  }

  setEscrowContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.escrowContract !== null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.escrowContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistryContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.registryContract !== null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.registryContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPlatformFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee > 10) return { ok: false, value: ERR_INVALID_PLATFORM_FEE };
    this.state.platformFee = newFee;
    return { ok: true, value: true };
  }

  setMaxPayouts(newMax: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.maxPayouts = newMax;
    return { ok: true, value: true };
  }

  processPayout(classId: number, totalAmount: number, instructorSplit: number, instructor: string, venue: string): Result<number> {
    if (this.state.nextPayoutId >= this.state.maxPayouts) return { ok: false, value: ERR_MAX_PAYOUTS_EXCEEDED };
    if (classId <= 0) return { ok: false, value: ERR_INVALID_CLASS_ID };
    if (totalAmount <= 0) return { ok: false, value: ERR_INVALID_TOTAL_AMOUNT };
    if (instructorSplit <= 0 || instructorSplit >= 100) return { ok: false, value: ERR_INVALID_SPLIT_PERCENTAGE };
    if (instructor === this.caller) return { ok: false, value: ERR_INVALID_INSTRUCTOR };
    if (venue === this.caller) return { ok: false, value: ERR_INVALID_VENUE };
    if (!this.state.escrowContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (!this.state.registryContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const classStatus = this.classStatuses.get(classId);
    if (classStatus !== true) return { ok: false, value: ERR_CLASS_NOT_COMPLETED };
    if (this.state.payoutsByClass.has(classId)) return { ok: false, value: ERR_PAYOUT_ALREADY_PROCESSED };

    this.escrowReleases.set(classId, { classId, amount: totalAmount });

    const platformShare = Math.floor((totalAmount * this.state.platformFee) / 100);
    const adjustedTotal = totalAmount - platformShare;
    const instructorAmount = Math.floor((adjustedTotal * instructorSplit) / 100);
    const venueAmount = adjustedTotal - instructorAmount;

    this.stxTransfers.push({ amount: instructorAmount, from: "contract", to: instructor });
    this.stxTransfers.push({ amount: venueAmount, from: "contract", to: venue });
    this.stxTransfers.push({ amount: platformShare, from: "contract", to: this.state.contractOwner });

    const id = this.state.nextPayoutId;
    const payout: Payout = {
      classId,
      totalAmount,
      instructorSplit,
      instructorAmount,
      venueAmount,
      platformAmount: platformShare,
      timestamp: this.blockHeight,
      instructor,
      venue,
      status: true,
    };
    this.state.payouts.set(id, payout);
    this.state.payoutsByClass.set(classId, id);
    this.state.nextPayoutId++;
    return { ok: true, value: id };
  }

  getPayout(id: number): Payout | null {
    return this.state.payouts.get(id) || null;
  }

  getPayoutByClass(classId: number): number | null {
    return this.state.payoutsByClass.get(classId) || null;
  }

  getPayoutHistory(classId: number): Result<Payout | null> {
    const payoutId = this.state.payoutsByClass.get(classId);
    if (payoutId === undefined) return { ok: false, value: ERR_PAYOUT_NOT_FOUND };
    return { ok: true, value: this.state.payouts.get(payoutId) || null };
  }

  updatePayoutSplit(payoutId: number, newSplit: number): Result<boolean> {
    const payout = this.state.payouts.get(payoutId);
    if (!payout) return { ok: false, value: ERR_PAYOUT_NOT_FOUND };
    if (payout.instructor !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (payout.status) return { ok: false, value: ERR_UPDATE_NOT_ALLOWED };
    if (newSplit <= 0 || newSplit >= 100) return { ok: false, value: ERR_INVALID_SPLIT_PERCENTAGE };

    const updated: Payout = { ...payout, instructorSplit: newSplit };
    this.state.payouts.set(payoutId, updated);
    this.state.payoutUpdates.set(payoutId, {
      updateSplit: newSplit,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getPayoutCount(): Result<number> {
    return { ok: true, value: this.state.nextPayoutId };
  }
}

describe("SplitPayout", () => {
  let contract: SplitPayoutMock;

  beforeEach(() => {
    contract = new SplitPayoutMock();
    contract.reset();
  });

  it("sets escrow contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setEscrowContract("ST2ESCROW");
    expect(result.ok).toBe(true);
    expect(contract.state.escrowContract).toBe("ST2ESCROW");
  });

  it("rejects escrow set by non-owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setEscrowContract("ST2ESCROW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets registry contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setRegistryContract("ST3REGISTRY");
    expect(result.ok).toBe(true);
    expect(contract.state.registryContract).toBe("ST3REGISTRY");
  });

  it("sets platform fee successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setPlatformFee(8);
    expect(result.ok).toBe(true);
    expect(contract.state.platformFee).toBe(8);
  });

  it("rejects invalid platform fee", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setPlatformFee(15);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PLATFORM_FEE);
  });

  it("processes payout successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.setRegistryContract("ST3REGISTRY");
    contract.caller = "ST1CALLER";
    contract.classStatuses.set(1, true);
    const result = contract.processPayout(1, 1000, 70, "ST4INSTRUCTOR", "ST5VENUE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const payout = contract.getPayout(0);
    expect(payout?.classId).toBe(1);
    expect(payout?.totalAmount).toBe(1000);
    expect(payout?.instructorSplit).toBe(70);
    expect(payout?.instructorAmount).toBe(665);
    expect(payout?.venueAmount).toBe(285);
    expect(payout?.platformAmount).toBe(50);
    expect(contract.stxTransfers).toEqual([
      { amount: 665, from: "contract", to: "ST4INSTRUCTOR" },
      { amount: 285, from: "contract", to: "ST5VENUE" },
      { amount: 50, from: "contract", to: "ST1OWNER" },
    ]);
  });

  it("rejects payout without escrow contract", () => {
    contract.setRegistryContract("ST3REGISTRY");
    const result = contract.processPayout(1, 1000, 70, "ST4INSTRUCTOR", "ST5VENUE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects history for non-existent payout", () => {
    const result = contract.getPayoutHistory(99);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAYOUT_NOT_FOUND);
  });

  it("rejects invalid split percentage", () => {
    contract.setEscrowContract("ST2ESCROW");
    contract.setRegistryContract("ST3REGISTRY");
    contract.classStatuses.set(1, true);
    const result = contract.processPayout(1, 1000, 0, "ST4INSTRUCTOR", "ST5VENUE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SPLIT_PERCENTAGE);
  });
});