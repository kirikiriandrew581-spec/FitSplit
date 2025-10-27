import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CLASS_ID = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_INVALID_CAPACITY = 103;
const ERR_INVALID_SPLIT = 104;
const ERR_INVALID_INSTRUCTOR = 105;
const ERR_INVALID_VENUE = 106;
const ERR_CLASS_ALREADY_EXISTS = 107;
const ERR_CLASS_NOT_FOUND = 108;
const ERR_INVALID_TIMESTAMP = 109;
const ERR_AUTHORITY_NOT_VERIFIED = 110;
const ERR_INVALID_RECIPIENT = 111;
const ERR_INVALID_STATUS = 112;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_MAX_CLASSES_EXCEEDED = 114;
const ERR_INVALID_CURRENCY = 115;
const ERR_INVALID_NAME = 116;
const ERR_UPDATE_NOT_ALLOWED = 117;
const ERR_INVALID_PARTICIPANT = 118;
const ERR_CLASS_NOT_OPEN = 119;
const ERR_ALREADY_REGISTERED = 120;

interface Class {
  name: string;
  price: number;
  capacity: number;
  instructorSplit: number;
  instructor: string;
  venue: string;
  timestamp: number;
  status: boolean;
  currency: string;
}

interface ClassUpdate {
  updateName: string;
  updatePrice: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ClassRegistryMock {
  state: {
    contractOwner: string;
    nextClassId: number;
    maxClasses: number;
    escrowContract: string | null;
    classes: Map<number, Class>;
    classRegistrations: Map<string, boolean>;
    classUpdates: Map<number, ClassUpdate>;
  } = {
    contractOwner: "ST1OWNER",
    nextClassId: 0,
    maxClasses: 1000,
    escrowContract: null,
    classes: new Map(),
    classRegistrations: new Map(),
    classUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1INSTRUCTOR";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      nextClassId: 0,
      maxClasses: 1000,
      escrowContract: null,
      classes: new Map(),
      classRegistrations: new Map(),
      classUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1INSTRUCTOR";
  }

  setEscrowContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.escrowContract !== null)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.escrowContract = contractPrincipal;
    return { ok: true, value: true };
  }

  createClass(
    name: string,
    price: number,
    capacity: number,
    instructorSplit: number,
    instructor: string,
    venue: string,
    currency: string
  ): Result<number> {
    if (this.state.nextClassId >= this.state.maxClasses)
      return { ok: false, value: ERR_MAX_CLASSES_EXCEEDED };
    if (!name || name.length === 0)
      return { ok: false, value: ERR_INVALID_NAME };
    if (price <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (capacity <= 0) return { ok: false, value: ERR_INVALID_CAPACITY };
    if (instructorSplit <= 0 || instructorSplit >= 100)
      return { ok: false, value: ERR_INVALID_SPLIT };
    if (instructor === this.caller)
      return { ok: false, value: ERR_INVALID_INSTRUCTOR };
    if (venue === this.caller) return { ok: false, value: ERR_INVALID_VENUE };
    if (!["STX", "USD"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    const id = this.state.nextClassId;
    const classData: Class = {
      name,
      price,
      capacity,
      instructorSplit,
      instructor,
      venue,
      timestamp: this.blockHeight,
      status: true,
      currency,
    };
    this.state.classes.set(id, classData);
    this.state.nextClassId++;
    return { ok: true, value: id };
  }

  registerForClass(classId: number): Result<boolean> {
    const classData = this.state.classes.get(classId);
    if (!classData) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (!classData.status) return { ok: false, value: ERR_CLASS_NOT_OPEN };
    const key = `${classId}-${this.caller}`;
    if (this.state.classRegistrations.has(key))
      return { ok: false, value: ERR_ALREADY_REGISTERED };
    this.state.classRegistrations.set(key, true);
    return { ok: true, value: true };
  }

  completeClass(classId: number): Result<boolean> {
    const classData = this.state.classes.get(classId);
    if (!classData) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (classData.instructor !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!classData.status) return { ok: false, value: ERR_CLASS_NOT_OPEN };
    this.state.classes.set(classId, { ...classData, status: false });
    return { ok: true, value: true };
  }

  updateClass(
    classId: number,
    newName: string,
    newPrice: number
  ): Result<boolean> {
    const classData = this.state.classes.get(classId);
    if (!classData) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (classData.instructor !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!classData.status) return { ok: false, value: ERR_UPDATE_NOT_ALLOWED };
    if (!newName || newName.length === 0)
      return { ok: false, value: ERR_INVALID_NAME };
    if (newPrice <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const updated: Class = { ...classData, name: newName, price: newPrice };
    this.state.classes.set(classId, updated);
    this.state.classUpdates.set(classId, {
      updateName: newName,
      updatePrice: newPrice,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getClass(id: number): Class | null {
    return this.state.classes.get(id) || null;
  }

  getClassStatus(id: number): Result<boolean> {
    const classData = this.state.classes.get(id);
    if (!classData) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    return { ok: true, value: classData.status };
  }

  getClassCount(): Result<number> {
    return { ok: true, value: this.state.nextClassId };
  }
}

describe("ClassRegistry", () => {
  let contract: ClassRegistryMock;

  beforeEach(() => {
    contract = new ClassRegistryMock();
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

  it("creates class successfully", () => {
    const result = contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const classData = contract.getClass(0);
    expect(classData?.name).toBe("Yoga");
    expect(classData?.price).toBe(1000);
    expect(classData?.capacity).toBe(20);
    expect(classData?.instructorSplit).toBe(70);
    expect(classData?.instructor).toBe("ST4INSTRUCTOR");
    expect(classData?.venue).toBe("ST5VENUE");
    expect(classData?.currency).toBe("STX");
    expect(classData?.status).toBe(true);
  });

  it("rejects class creation with invalid name", () => {
    const result = contract.createClass(
      "",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NAME);
  });

  it("rejects class creation with invalid split", () => {
    const result = contract.createClass(
      "Yoga",
      1000,
      20,
      0,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SPLIT);
  });

  it("registers participant successfully", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST6PARTICIPANT";
    const result = contract.registerForClass(0);
    expect(result.ok).toBe(true);
    expect(contract.state.classRegistrations.get("0-ST6PARTICIPANT")).toBe(
      true
    );
  });

  it("rejects registration for non-existent class", () => {
    contract.caller = "ST6PARTICIPANT";
    const result = contract.registerForClass(99);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLASS_NOT_FOUND);
  });

  it("rejects duplicate registration", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST6PARTICIPANT";
    contract.registerForClass(0);
    const result = contract.registerForClass(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_REGISTERED);
  });

  it("completes class successfully", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST4INSTRUCTOR";
    const result = contract.completeClass(0);
    expect(result.ok).toBe(true);
    const classData = contract.getClass(0);
    expect(classData?.status).toBe(false);
  });

  it("rejects class completion by non-instructor", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST6FAKE";
    const result = contract.completeClass(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates class successfully", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST4INSTRUCTOR";
    const result = contract.updateClass(0, "Pilates", 1500);
    expect(result.ok).toBe(true);
    const classData = contract.getClass(0);
    expect(classData?.name).toBe("Pilates");
    expect(classData?.price).toBe(1500);
    const update = contract.state.classUpdates.get(0);
    expect(update?.updateName).toBe("Pilates");
    expect(update?.updatePrice).toBe(1500);
  });

  it("rejects update for closed class", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.caller = "ST4INSTRUCTOR";
    contract.completeClass(0);
    const result = contract.updateClass(0, "Pilates", 1500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UPDATE_NOT_ALLOWED);
  });

  it("gets class count correctly", () => {
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    contract.createClass(
      "Pilates",
      1500,
      15,
      60,
      "ST6INSTRUCTOR",
      "ST7VENUE",
      "USD"
    );
    const result = contract.getClassCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects class creation with max classes exceeded", () => {
    contract.state.maxClasses = 1;
    contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "STX"
    );
    const result = contract.createClass(
      "Pilates",
      1500,
      15,
      60,
      "ST6INSTRUCTOR",
      "ST7VENUE",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CLASSES_EXCEEDED);
  });

  it("rejects invalid currency", () => {
    const result = contract.createClass(
      "Yoga",
      1000,
      20,
      70,
      "ST4INSTRUCTOR",
      "ST5VENUE",
      "BTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });
});
