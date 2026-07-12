import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { connectToDB } = await import("../src/lib/db");
const TradingAccount = (await import("../src/models/trading-account")).default;
const { makeBroker } = await import("../src/lib/trading/engines");
await connectToDB();
const account = await TradingAccount.findOne({ envKey: "paper-50194613" }).lean();
const broker = makeBroker(account as never, "us");
for (const sym of ["MMM", "AOS", "TQQQ"]) {
  const h = await broker.historyLong(sym, 80);
  console.log(sym, "rows:", h.length, "최신:", h[0], "말단:", h[h.length - 1]);
}
process.exit();
