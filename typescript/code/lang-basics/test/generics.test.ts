import { describe, expect, it } from "vitest";
import { expectTypeOf } from "vitest";
import {
  collectIds,
  Collection,
  defineConfig,
  erasedHint,
  first,
  identity,
  pair,
  pluck,
} from "../src/generics.ts";
import type { Entity } from "../src/generics.ts";

describe("泛型", () => {
  it("推断优先，不需要手写实参", () => {
    expect(identity("php").length).toBe(3);
    expectTypeOf(identity(42)).toEqualTypeOf<number>();
    expect(pair("a", 1)).toEqual(["a", 1]);
    expectTypeOf(pair("a", 1)).toEqualTypeOf<[string, number]>();
  });

  it("约束 T extends Entity<string>", () => {
    const rows = [
      { id: "1", name: "键盘" },
      { id: "2", name: "鼠标" },
    ];
    expect(collectIds(rows)).toEqual(["1", "2"]);
    expect(pluck(rows, "name")).toEqual(["键盘", "鼠标"]);
    // pluck(rows, "missing") 会编译失败：字段名不存在
    expectTypeOf(pluck(rows, "id")).toEqualTypeOf<string[]>();
  });

  it("Collection 链式转换保留元素类型", () => {
    const ids: Entity<string>[] = [{ id: "7" }, { id: "8" }];
    const result = Collection.from(ids)
      .map((e) => e.id)
      .filter((id) => id > "7")
      .toArray();
    expect(result).toEqual(["8"]);
    expectTypeOf(result).toEqualTypeOf<string[]>();
    expect(
      Collection.from([{ n: 1 }, { n: 2 }]).reduce((acc, item) => acc + item.n, 0),
    ).toBe(3);
    expect(Collection.from([1, 2, 3]).size).toBe(3);
  });

  it("const 类型参数保留字面量", () => {
    const cfg = defineConfig({ cache: "redis", ttl: 60 });
    expect(cfg.ttl).toBe(60);
    expectTypeOf(cfg.cache).toEqualTypeOf<"redis">();
  });

  it("空数组需要 fallback，避免 undefined", () => {
    expect(first<string>([], "none")).toBe("none");
    expect(first(["a", "b"], "z")).toBe("a");
  });

  it("擦除：函数体里问不出 T", () => {
    expect(erasedHint(1)).toContain("typeof value = number");
    expect(erasedHint("x")).toContain("typeof value = string");
  });
});
