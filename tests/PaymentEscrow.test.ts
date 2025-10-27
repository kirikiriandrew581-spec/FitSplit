import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CLASS_ID = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_CLASS_NOT_FOUND = 103;
const ERR_INSUFFICIENT_BALANCE = 104;
const ERR_ALREADY_ESCROWED = 105;
const ERR_ESCROW_NOT_FOUND = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_RECIPIENT = 109;
const ERR_INVALID_STATUS = 110;
const ERR_TRANSFER_FAILED = 111;
const ERR_INVALID_UPDATE_PARAM = 112;
const ERR_UPDATE_NOT_ALLOWED = 113;
const ERR_MAX_ESCROWS_EXCEEDED = 114;
const ERR_INVALID_CURRENCY = 115;
const ERR_INVALID_PARTICIPANT = 116;
const ERR_ESCROW_ALREADY_RELEASED = 117;
const ERR_INVALID_ESCROW_ID = 118;
const ERR_CLASS_NOT_OPEN = 119;
const ERR_INVALID_REGISTRY = 120;

interface Escrow {
  classId: number;
  participant: string;
  amount: number;
  timestamp: number;
  status: boolean;
  currency: string;
}

interface EscrowUpdate {
  updateAmount: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PaymentEscrowMock {
  state: {
    contractOwner: string;
    nextEscrowId: number;
    maxEscrows: number;
    registryContract: string | null;
    payoutContract: string | null;
    escrows: Map<number, Escrow>;
    escrowsByClass: Map<string, number>;
    escrowUpdates: Map<number, EscrowUpdate>;
  } = {
    contractOwner: "ST1OWNER",
    nextEscrowId: 0,
    maxEscrows: 10000,
    registryContract: null,
    payoutContract: null,
    escrows: new Map(),
    escrowsByClass: new Map(),
    escrowUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1OWNER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  classStatuses: Map<number, boolean> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      nextEscrowId: 0,
      maxEscrows: 10000,
      registryContract: null,
      payoutContract: null,
      escrows: new Map(),
      escrowsByClass: new Map(),
      escrowUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1OWNER";
    this.stxTransfers = [];
    this.classStatuses = new Map();
  }

  setRegistryContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.registryContract !== null)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.registryContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPayoutContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.payoutContract !== null)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.payoutContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxEscrows(newMax: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.maxEscrows = newMax;
    return { ok: true, value: true };
  }

  escrowPayment(
    classId: number,
    amount: number,
    currency: string
  ): Result<number> {
    if (this.state.nextEscrowId >= this.state.maxEscrows)
      return { ok: false, value: ERR_MAX_ESCROWS_EXCEEDED };
    if (classId <= 0) return { ok: false, value: ERR_INVALID_CLASS_ID };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (!["STX", "USD"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!this.state.registryContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const classStatus = this.classStatuses.get(classId);
    if (classStatus !== true) return { ok: false, value: ERR_CLASS_NOT_OPEN };
    const key = `${classId}-${this.caller}`;
    if (this.state.escrowsByClass.has(key))
      return { ok: false, value: ERR_ALREADY_ESCROWED };
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    const id = this.state.nextEscrowId;
    const escrow: Escrow = {
      classId,
      participant: this.caller,
      amount,
      timestamp: this.blockHeight,
      status: true,
      currency,
    };
    this.state.escrows.set(id, escrow);
    this.state.escrowsByClass.set(key, id);
    this.state.nextEscrowId++;
    return { ok: true, value: id };
  }

  releasePayment(classId: number, amount: number): Result<boolean> {
    if (this.caller !== this.state.payoutContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (classId <= 0) return { ok: false, value: ERR_INVALID_CLASS_ID };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (!this.state.registryContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const classStatus = this.classStatuses.get(classId);
    if (classStatus !== true) return { ok: false, value: ERR_CLASS_NOT_OPEN };
    this.stxTransfers.push({
      amount,
      from: "contract",
      to: this.state.payoutContract!,
    });
    return { ok: true, value: true };
  }

  updateEscrowAmount(escrowId: number, newAmount: number): Result<boolean> {
    const escrow = this.state.escrows.get(escrowId);
    if (!escrow) return { ok: false, value: ERR_ESCROW_NOT_FOUND };
    if (escrow.participant !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!escrow.status)
      return { ok: false, value: ERR_ESCROW_ALREADY_RELEASED };
    if (newAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const updated: Escrow = { ...escrow, amount: newAmount };
    this.state.escrows.set(escrowId, updated);
    this.state.escrowUpdates.set(escrowId, {
      updateAmount: newAmount,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getEscrow(id: number): Escrow | null {
    return this.state.escrows.get(id) || null;
  }

  getEscrowByClass(classId: number, participant: string): number | null {
    return this.state.escrowsByClass.get(`${classId}-${participant}`) || null;
  }

  getEscrowCount(): Result<number> {
    return { ok: true, value: this.state.nextEscrowId };
  }
}

describe("PaymentEscrow", () => {
  let contract: PaymentEscrowMock;

  beforeEach(() => {
    contract = new PaymentEscrowMock();
    contract.reset();
  });

  it("sets registry contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setRegistryContract("ST2REGISTRY");
    expect(result.ok).toBe(true);
    expect(contract.state.registryContract).toBe("ST2REGISTRY");
  });

  it("rejects registry set by non-owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setRegistryContract("ST2REGISTRY");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets payout contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setPayoutContract("ST3PAYOUT");
    expect(result.ok).toBe(true);
    expect(contract.state.payoutContract).toBe("ST3PAYOUT");
  });

  it("sets max escrows successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setMaxEscrows(5000);
    expect(result.ok).toBe(true);
    expect(contract.state.maxEscrows).toBe(5000);
  });

  it("creates escrow successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setRegistryContract("ST2REGISTRY");
    contract.caller = "ST1PARTICIPANT";
    contract.classStatuses.set(1, true);
    const result = contract.escrowPayment(1, 1000, "STX");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const escrow = contract.getEscrow(0);
    expect(escrow?.classId).toBe(1);
    expect(escrow?.amount).toBe(1000);
    expect(escrow?.participant).toBe("ST1PARTICIPANT");
    expect(escrow?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([
      { amount: 1000, from: "ST1PARTICIPANT", to: "contract" },
    ]);
  });

  it("rejects escrow without registry contract", () => {
    const result = contract.escrowPayment(1, 1000, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects escrow for non-open class", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, false);
    const result = contract.escrowPayment(1, 1000, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLASS_NOT_OPEN);
  });

  it("rejects duplicate escrow for class", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    const result = contract.escrowPayment(1, 1000, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_ESCROWED);
  });

  it("releases payment successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setRegistryContract("ST2REGISTRY");
    contract.setPayoutContract("ST3PAYOUT");
    contract.caller = "ST1PARTICIPANT";
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    contract.caller = "ST3PAYOUT";
    const result = contract.releasePayment(1, 1000);
    expect(result.ok).toBe(true);
    expect(contract.stxTransfers[1]).toEqual({
      amount: 1000,
      from: "contract",
      to: "ST3PAYOUT",
    });
  });

  it("rejects release by non-payout contract", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.setPayoutContract("ST3PAYOUT");
    contract.caller = "ST4FAKE";
    const result = contract.releasePayment(1, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates escrow amount successfully", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    const result = contract.updateEscrowAmount(0, 1500);
    expect(result.ok).toBe(true);
    const escrow = contract.getEscrow(0);
    expect(escrow?.amount).toBe(1500);
    const update = contract.state.escrowUpdates.get(0);
    expect(update?.updateAmount).toBe(1500);
  });

  it("rejects update by non-participant", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    contract.caller = "ST4FAKE";
    const result = contract.updateEscrowAmount(0, 1500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets escrow count correctly", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    contract.classStatuses.set(2, true);
    contract.escrowPayment(2, 2000, "STX");
    const result = contract.getEscrowCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects escrow with invalid currency", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.classStatuses.set(1, true);
    const result = contract.escrowPayment(1, 1000, "BTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("rejects escrow with max escrows exceeded", () => {
    contract.setRegistryContract("ST2REGISTRY");
    contract.state.maxEscrows = 1;
    contract.classStatuses.set(1, true);
    contract.escrowPayment(1, 1000, "STX");
    const result = contract.escrowPayment(2, 2000, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ESCROWS_EXCEEDED);
  });
});
