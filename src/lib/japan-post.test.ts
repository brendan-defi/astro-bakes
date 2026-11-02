// @vitest-environment node
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { DELIVERY_SLOTS } from "./delivery-slots";
import {
  buildJapanPostExport, cp932Check, japanPostCsv, japanPostPhone, japanPostRow, jstYmd, JP_COL, JP_COLUMNS, JP_MAX_ROWS, senderProblems, toZenkaku,
  type JapanPostContext, type ShipmentOrder,
} from "./japan-post";

const JST = (iso: string) => new Date(`${iso}+09:00`);
const ctx: JapanPostContext = {
  shipAt: JST("2026-11-05T00:00:00"),
  arriveAt: JST("2026-11-06T00:00:00"),
  sender: { name: "Astro Bakes", postal: "154-0024", prefecture: "東京都", city: "世田谷区", line1: "三軒茶屋1-2-3", line2: "", phone: "03-1234-5678" },
  options: { itemName: "焼き菓子", chilled: false, fragile: true, perishable: true, collect: true },
};
const order = (over: Partial<ShipmentOrder> = {}): ShipmentOrder => ({
  number: "AB-003-001", shipToName: "山田花子", phone: "090-1234-5678", postalCode: "1530061", prefecture: "東京都", city: "目黒区", town: "中目黒", line1: "1-2-3", line2: "Room 7", slot: "14_16", ...over,
});
const cell = (cells: string[], col: number) => cells[col - 1];

describe("japanPostRow", () => {
  it("writes exactly 72 cells, filling the columns Japan Post's own sample file fills, and no others", () => {
    const { cells, problems } = japanPostRow(order(), ctx);
    expect(cells).toHaveLength(JP_COLUMNS);
    expect(problems).toEqual([]);
    const filled = cells.map((c, i) => (c ? i + 1 : 0)).filter(Boolean);
    // The sample's columns, less those we have no data for (10 カナ, 17–19 company and email, 24–25 sender 敬称/カナ,
    // 32–34, 36–37 品名番号/個数), and the sender's building line, empty here.
    expect(filled).toEqual([1, 2, 7, 8, 9, 11, 12, 13, 14, 15, 16, 23, 26, 27, 28, 29, 31, 35, 39, 40, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 62, 64, 65, 68, 69, 70, 71, 72]);
    for (const col of [39, 40, 46, 47, 48, 49, 51, 68, 69, 70, 71, 72]) expect(cell(cells, col), `column ${col}`).toBe("0");
  });

  it("maps the recipient, the sender, the parcel and the dates", () => {
    const { cells } = japanPostRow(order(), ctx);
    expect(cell(cells, JP_COL.kind)).toBe("1");
    expect(cell(cells, JP_COL.payment)).toBe("0");
    expect(cell(cells, JP_COL.labels)).toBe("1");
    expect(cell(cells, JP_COL.toName)).toBe("山田花子");
    expect(cell(cells, JP_COL.toHonorific)).toBe("様");
    expect(cell(cells, JP_COL.toPostal)).toBe("1530061");
    expect(cell(cells, JP_COL.toPrefecture)).toBe("東京都");
    expect(cell(cells, JP_COL.toCity)).toBe("目黒区中目黒");
    expect(cell(cells, JP_COL.toLine1)).toBe("１－２－３");
    expect(cell(cells, JP_COL.toLine2)).toBe("Ｒｏｏｍ　７");
    expect(cell(cells, JP_COL.toPhone)).toBe("090-1234-5678");
    expect(cell(cells, JP_COL.fromName)).toBe("Ａｓｔｒｏ　Ｂａｋｅｓ");
    expect(cell(cells, JP_COL.fromPostal)).toBe("1540024");
    expect(cell(cells, JP_COL.fromCity)).toBe("世田谷区");
    expect(cell(cells, JP_COL.fromLine1)).toBe("三軒茶屋１－２－３");
    expect(cell(cells, JP_COL.fromPhone)).toBe("03-1234-5678");
    expect(cell(cells, JP_COL.itemName)).toBe("焼き菓子");
    expect([cell(cells, JP_COL.chilled), cell(cells, JP_COL.fragile), cell(cells, JP_COL.perishable)]).toEqual(["0", "1", "1"]);
    expect(cell(cells, JP_COL.sendDate)).toBe("20261105");
    expect(cell(cells, JP_COL.deliveryDate)).toBe("20261106");
    expect(cell(cells, JP_COL.slot)).toBe("53");
    expect(cell(cells, JP_COL.note)).toBe("ＡＢ－００３－００１");
    expect(cell(cells, JP_COL.handover)).toBe("0");
    expect(cell(cells, JP_COL.discount)).toBe("0");
    // Taken to the post office instead (持込).
    expect(cell(japanPostRow(order(), { ...ctx, options: { ...ctx.options, collect: false } }).cells, JP_COL.handover)).toBe("1");
  });

  it("gives every time slot Japan Post's code", () => {
    const codes = DELIVERY_SLOTS.map((slot) => cell(japanPostRow(order({ slot }), ctx).cells, JP_COL.slot));
    expect(codes).toEqual(["00", "51", "52", "53", "54", "55", "57"]);
  });

  it("drops a typed 様 (the label adds its own) and leaves out an empty building line", () => {
    const { cells } = japanPostRow(order({ shipToName: "山田花子 様", line2: null }), ctx);
    expect(cell(cells, JP_COL.toName)).toBe("山田花子");
    expect(cell(cells, JP_COL.toLine2)).toBe("");
  });

  it("flags what the owner must fix in the tool, without cutting anything short", () => {
    const long = "あ".repeat(26);
    const { cells, problems } = japanPostRow(order({ shipToName: long, town: "う".repeat(20), line2: "い".repeat(26), phone: "12" }), ctx);
    expect(cell(cells, JP_COL.toName)).toBe(long);
    expect(problems).toEqual([
      "The recipient's name is 26 characters; the label takes 25.",
      "The prefecture, city and town are 26 characters together; the label takes 25.",
      "The building and room is 26 characters; the label takes 25.",
      "The phone number “12” isn't one the label takes, so it's left off.",
    ]);
  });

  it("writes a character the file can't carry as 〓 and says so, and warns about ones that may print wrongly", () => {
    const { cells, problems } = japanPostRow(order({ shipToName: "𠮷田😀", line1: "髙橋ビル①" }), ctx);
    expect(cell(cells, JP_COL.toName)).toBe("〓田〓");
    expect(problems).toEqual(["The recipient's name has 𠮷 😀, which the label can't print (it shows as 〓).", "The street address has 髙 ①, which may print wrongly on the label."]);
  });

  it("dates in Japan time, across a year end", () => {
    expect(jstYmd(new Date("2026-10-24T15:00:00Z"))).toBe("20261025");
    expect(jstYmd(new Date("2026-12-31T15:00:00Z"))).toBe("20270101");
  });
});

describe("toZenkaku", () => {
  it("makes ASCII and spaces full-width, joins half-width kana, and keeps quotes printable", () => {
    expect(toZenkaku("Room 7-B")).toBe("Ｒｏｏｍ　７－Ｂ");
    expect(toZenkaku("ｶﾞｽﾋﾞﾙ")).toBe("ガスビル");
    expect(toZenkaku(`O'Brien "Jr"`)).toBe("Ｏ’Ｂｒｉｅｎ　”Ｊｒ”");
    expect(toZenkaku("〜−")).toBe("～－");
    expect(toZenkaku("ガ".normalize("NFD"))).toBe("ガ");
    expect(toZenkaku("a\tb\u0007")).toBe("ａｂ");
  });
  it("changes nothing the second time", () => {
    for (const s of ["Room 7-B", "ｶﾞｽﾋﾞﾙ 3F", `O'Brien`, "山田　花子"]) expect(toZenkaku(toZenkaku(s))).toBe(toZenkaku(s));
  });
});

describe("japanPostPhone and the sender", () => {
  it("takes Japanese numbers as typed and refuses the rest", () => {
    expect(japanPostPhone("090-1234-5678")).toBe("090-1234-5678");
    expect(japanPostPhone("０９０１２３４５６７８")).toBe("09012345678");
    expect(japanPostPhone("+81 90-1234-5678")).toBe("090-1234-5678");
    expect(japanPostPhone("12345")).toBeNull();
  });
  it("names each missing sender detail", () => {
    const empty = { name: "", postal: "", prefecture: "東京都", city: "", line1: "", line2: "", phone: "" };
    expect(senderProblems(empty, { ...ctx.options, itemName: " " })).toEqual(["Sender name is empty.", "Sender postal code is empty.", "Sender city / ward is empty.", "Sender address is empty.", "Sender phone is empty.", "Item description (品名) is empty."]);
    expect(senderProblems({ ...ctx.sender, phone: "12" }, ctx.options)).toEqual(["Sender phone isn't a Japanese phone number."]);
    expect(senderProblems(ctx.sender, { ...ctx.options, itemName: "焼".repeat(21) })).toEqual(["Item description (品名) is 21 characters; the label takes 20."]);
    expect(senderProblems(ctx.sender, ctx.options)).toEqual([]);
  });
});

describe("the file", () => {
  it("is CRLF CSV without a header, quoting only cells that need it", () => {
    expect(japanPostCsv([["a", "b,c", 'd"e'], ["", "", ""]])).toBe('a,"b,c","d""e"\r\n,,\r\n');
  });

  it("encodes as CP932 and reads back as 72 columns a row, with the order's details", () => {
    const x = buildJapanPostExport([order(), order({ number: "AB-003-002", shipToName: "髙橋 ①", slot: "none" })], ctx);
    expect(x.fileProblems).toEqual([]);
    const text = iconv.decode(Buffer.from(x.bytes), "cp932");
    const lines = text.split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.slice(0, -1).map((l) => l.split(",").length)).toEqual([72, 72]);
    expect(lines[1].split(",")[JP_COL.toName - 1]).toBe("髙橋　①");
    expect(lines[1].split(",")[JP_COL.slot - 1]).toBe("00");
    expect(x.rows).toEqual([{ number: "AB-003-001", problems: [] }, { number: "AB-003-002", problems: ["The recipient's name has 髙 ①, which may print wrongly on the label."] }]);
  });

  it("isn't offered while the sender is missing, with no orders, or with more than one file takes", () => {
    expect(buildJapanPostExport([order()], { ...ctx, sender: { ...ctx.sender, name: "" } }).fileProblems).toEqual(["Sender name is empty. Fill it in under Settings → Shipping."]);
    expect(buildJapanPostExport([], ctx).fileProblems).toEqual(["There are no orders to ship."]);
    const many = Array.from({ length: JP_MAX_ROWS + 1 }, (_, i) => order({ number: `AB-003-${String(i + 1).padStart(4, "0")}` }));
    expect(buildJapanPostExport(many, ctx).fileProblems).toEqual([`There are ${JP_MAX_ROWS + 1} orders; Webゆうパックプリント takes ${JP_MAX_ROWS} per file.`]);
  });

  it("checks characters one by one", () => {
    expect(cp932Check("山田?")).toEqual({ clean: "山田?", missing: [], risky: [] });
    expect(cp932Check("𠮷﨑")).toEqual({ clean: "〓﨑", missing: ["𠮷"], risky: ["﨑"] });
  });
});
