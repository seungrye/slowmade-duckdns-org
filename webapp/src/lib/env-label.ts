/** The display label for an account key (env) - "paper" -> 모의, "real" -> 실전, "paper-sub" -> "모의·sub".
 *  A multi-portfolio setup (stock-automator's account.name) arrives as a "-{name}" suffix on env. */
export function envLabel(env: string): string {
  const [base, ...rest] = env.split("-");
  const head = base === "paper" ? "모의" : base === "real" ? "실전" : base;
  return rest.length ? `${head}·${rest.join("-")}` : head;
}
