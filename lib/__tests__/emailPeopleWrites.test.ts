import { describe, expect, it } from "vitest";
import { applyPeopleWrites, type PersonWriteSink } from "../comms/emailPeopleWrites";
import type { PersonWrite } from "../comms/emailPeople";
import type { Person } from "../types";

const person = (over: Partial<Person> = {}): Person => ({
  id: "p",
  name: "P",
  verticalId: "roofing",
  status: "unlit",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const create = (id: string, address: string): PersonWrite => ({
  kind: "create",
  address,
  person: person({ id, name: id, email: address }),
});

const merge = (id: string, address: string): PersonWrite => ({
  kind: "merge",
  address,
  personId: id,
  fills: { email: address },
  person: person({ id, name: id, email: address }),
});

function sink(fail: (p: Person) => boolean = () => false) {
  const wrote: Person[] = [];
  const impl: PersonWriteSink = {
    async upsertPerson(p) {
      if (fail(p)) throw new Error(`store said no to ${p.id}`);
      wrote.push(p);
    },
  };
  return { impl, wrote };
}

describe("applyPeopleWrites", () => {
  it("writes creates and merges, reporting each by id", async () => {
    const s = sink();
    const res = await applyPeopleWrites(
      [create("dana-reyes", "dana@roofco.com"), merge("trent-brands", "trent@thetitlebase.com")],
      s.impl
    );
    expect(res.created).toEqual(["dana-reyes"]);
    expect(res.merged).toEqual(["trent-brands"]);
    expect(res.failed).toEqual([]);
    expect(s.wrote.map((p) => p.id)).toEqual(["dana-reyes", "trent-brands"]);
  });

  it("writes nothing and reports nothing for an empty plan", async () => {
    const s = sink();
    const res = await applyPeopleWrites([], s.impl);
    expect(res).toEqual({ created: [], merged: [], failed: [] });
    expect(s.wrote).toEqual([]);
  });

  it("keeps going after one failed row — the rest of the batch still lands", async () => {
    // The rows are independent people. Aborting on the first error would drop
    // contacts we could have created because an unrelated row failed.
    const s = sink((p) => p.id === "dana-reyes");
    const res = await applyPeopleWrites(
      [
        create("dana-reyes", "dana@roofco.com"),
        create("sam-cole", "sam@roofco.com"),
        merge("trent-brands", "trent@thetitlebase.com"),
      ],
      s.impl
    );
    expect(s.wrote.map((p) => p.id)).toEqual(["sam-cole", "trent-brands"]);
    expect(res.created).toEqual(["sam-cole"]);
    expect(res.merged).toEqual(["trent-brands"]);
  });

  it("reports the failure with its address, id and kind — never a silent success", async () => {
    // A swallowed failure tells the rep the CRM captured a human it does not
    // have; the caller needs enough to name them in the log.
    const s = sink((p) => p.id === "dana-reyes");
    const res = await applyPeopleWrites([create("dana-reyes", "dana@roofco.com")], s.impl);
    expect(res.created).toEqual([]);
    expect(res.failed).toEqual([
      {
        address: "dana@roofco.com",
        personId: "dana-reyes",
        kind: "create",
        error: "store said no to dana-reyes",
      },
    ]);
  });

  it("reports a failed MERGE under the existing row's id, not the write's address", async () => {
    const s = sink(() => true);
    const res = await applyPeopleWrites([merge("trent-brands", "trent@thetitlebase.com")], s.impl);
    expect(res.merged).toEqual([]);
    expect(res.failed[0]).toMatchObject({ personId: "trent-brands", kind: "merge" });
  });

  it("survives a non-Error throw rather than crashing the whole capture", async () => {
    const impl: PersonWriteSink = {
      async upsertPerson() {
        throw "connection reset";
      },
    };
    const res = await applyPeopleWrites([create("dana-reyes", "dana@roofco.com")], impl);
    expect(res.failed[0].error).toBe("connection reset");
  });

  it("writes rows in plan order — inc.11's id accumulator assumes they land in sequence", async () => {
    const order: string[] = [];
    const impl: PersonWriteSink = {
      async upsertPerson(p) {
        order.push(`start:${p.id}`);
        await Promise.resolve();
        order.push(`end:${p.id}`);
      },
    };
    await applyPeopleWrites(
      [create("dana-reyes", "dana@roofco.com"), create("dana-reyes-2", "d.reyes@roofco.com")],
      impl
    );
    expect(order).toEqual([
      "start:dana-reyes",
      "end:dana-reyes",
      "start:dana-reyes-2",
      "end:dana-reyes-2",
    ]);
  });
});
