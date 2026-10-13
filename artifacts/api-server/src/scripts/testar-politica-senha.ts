/**
 * Teste manual da política de senha (regras locais + HIBP).
 *
 * Uso (a partir de artifacts/api-server):
 *   pnpm exec tsx src/scripts/testar-politica-senha.ts
 *
 * Precisa de internet para o HIBP. Se HIBP_DISABLED=true, os casos PWNED falham de propósito.
 * Obs.: "correct horse battery staple" (XKCD) consta no HIBP e é rejeitada de propósito; por isso o caso ACEITA usa outra frase.
 */
import { validatePasswordPolicy } from "../utils/password-policy";

const ctx = { email: "teste@ism.com", nome: "Maria Silva" };

const casos: Array<[string, string]> = [
  ["12345678901", "TOO_SHORT"],
  ["password1234", "PWNED"],
  ["lagarto-violeta atravessa a ponte 48", "ACEITA"],
  ["teste@ism.com1234", "CONTAINS_EMAIL"],
  ["mariasilva2024!!", "CONTAINS_NAME"],
];

let falhas = 0;

for (const [senha, esperado] of casos) {
  const r = await validatePasswordPolicy(senha, ctx);
  const obtido = r?.code ?? "ACEITA";
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${senha.padEnd(32)} esperado=${esperado} obtido=${obtido}`);
}

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);