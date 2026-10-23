import { describe, expect, it } from "vitest";
import { applyQuery, compareValues, normalize, type QueryColumn, type TableFilter } from "./table-query";

interface Row {
  id: string;
  code: string;
  name: string;
  qty?: number;
  status: "open" | "done";
}

const rows: Row[] = [
  { id: "1", code: "WO-0010", name: "Teak chair", qty: 12, status: "open" },
  { id: "2", code: "WO-0002", name: "Café table", qty: 3, status: "done" },
  { id: "3", code: "WO-0001", name: "Teak bench", status: "open" },
];
const cols: QueryColumn<Row>[] = [
  { key: "code", text: (r) => r.code },
  { key: "name", text: (r) => r.name },
  { key: "qty", sort: (r) => r.qty },
];
const status: TableFilter<Row> = {
  id: "status",
  label: "Status",
  options: [
    { id: "open", label: "Open" },
    { id: "done", label: "Done" },
  ],
  test: (r, v) => r.status === v,
};
const ids = (rs: Row[]) => rs.map((r) => r.id);

describe("table query", () => {
  it("searches every word across columns, ignoring case and accents", () => {
    expect(ids(applyQuery(rows, cols, { search: "teak", filters: {} }))).toEqual(["1", "3"]);
    expect(ids(applyQuery(rows, cols, { search: "TEAK bench", filters: {} }))).toEqual(["3"]);
    expect(ids(applyQuery(rows, cols, { search: "cafe", filters: {} }))).toEqual(["2"]);
    expect(normalize("Café")).toBe("cafe");
  });

  it("filters, and 'all' means no filter", () => {
    expect(ids(applyQuery(rows, cols, { search: "", filters: { status: "done" } }, { filters: [status] }))).toEqual(["2"]);
    expect(ids(applyQuery(rows, cols, { search: "", filters: { status: "all" } }, { filters: [status] }))).toHaveLength(3);
  });

  it("sorts codes naturally and keeps blanks last in both directions", () => {
    const asc = applyQuery(rows, cols, { search: "", filters: {}, sort: { column: "code", direction: "ascending" } });
    expect(asc.map((r) => r.code)).toEqual(["WO-0001", "WO-0002", "WO-0010"]);
    const byQtyDesc = applyQuery(rows, cols, { search: "", filters: {}, sort: { column: "qty", direction: "descending" } });
    expect(ids(byQtyDesc)).toEqual(["1", "2", "3"]);
    const byQtyAsc = applyQuery(rows, cols, { search: "", filters: {}, sort: { column: "qty", direction: "ascending" } });
    expect(ids(byQtyAsc)).toEqual(["2", "1", "3"]);
  });

  it("falls back to the row's own text when no column says what to search", () => {
    expect(ids(applyQuery(rows, [], { search: "0010", filters: {} }))).toEqual(["1"]);
    expect(compareValues("item 2", "item 10")).toBeLessThan(0);
  });
});
