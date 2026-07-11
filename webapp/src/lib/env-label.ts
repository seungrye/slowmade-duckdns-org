/** 계좌 키(env) 표시 라벨 — "paper"→모의, "real"→실전, "paper-sub"→"모의·sub".
 *  멀티 포트폴리오(stock-automator 의 account.name)가 env 에 "-{name}" 접미로 온다. */
export function envLabel(env: string): string {
  const [base, ...rest] = env.split("-");
  const head = base === "paper" ? "모의" : base === "real" ? "실전" : base;
  return rest.length ? `${head}·${rest.join("-")}` : head;
}
