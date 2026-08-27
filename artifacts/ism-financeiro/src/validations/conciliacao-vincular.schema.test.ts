/**
 * Regressão DEF-04 / Card 42 - Δ do modal no Modo B (ciclo de vida adiado).
 * Run: npx tsx --test src/validations/conciliacao-vincular.schema.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    buildVincularFormSchema,
    calcDeltaVincularCents,
} from "./conciliacao-vincular.schema";

describe("calcDeltaVincularCents - Modo B (quitado_acumulado)", () => {
    const tituloId = 99;
    const valorById = new Map<number, string | number>([[tituloId, 4000]]);

    function item(desconto = "0,00", juros = "0,00") {
        return {lancamento_id: tituloId, desconto, juros_multa: juros};
    }

    it("mesa 5×R$1.000: passos 1–3 mostram falta (parcial), sem residual Modo A", () => {
        let quitado = 0;
        for (let step = 0; step < 3; step++) {
            const quitadoById = new Map([[tituloId, quitado]]);
            const {deltaCents, somaBasesCents} = calcDeltaVincularCents(
                1000,
                [item()],
                valorById,
                quitadoById,
            );
            assert.ok(deltaCents != null);
            // base restante = 4000 − quitado; extrato 1000 ⇒ Δ negativo (falta no título)
            assert.equal(somaBasesCents, 400_000 - Math.round(quitado * 100));
            assert.ok(deltaCents! < 0, `passo ${step + 1}: esperado pagamento parcial`);
            quitado += 1000;
        }
    });

    it("passo 4 (quitado=3000): Δ=0 - linha fecha o título", () => {
        const {deltaCents} = calcDeltaVincularCents(
            1000,
            [item()],
            valorById,
            new Map([[tituloId, 3000]]),
        );
        assert.equal(deltaCents, 0);
    });

    it("passo 5 (quitado=4000): Δ=+1000 - juros, não residual", () => {
        const {deltaCents, somaBasesCents} = calcDeltaVincularCents(
            1000,
            [item()],
            valorById,
            new Map([[tituloId, 4000]]),
        );
        assert.equal(somaBasesCents, 0);
        assert.equal(deltaCents, 100_000);
    });

    it("sem quitado_acumulado (bug antigo): 1º vínculo via residual falso de 3000", () => {
        // Simula a cegueira: Δ com base=4000 e extrato=1000
        const {deltaCents: cego} = calcDeltaVincularCents(1000, [item()], valorById, new Map());
        assert.equal(cego, -300_000);
        // Com quitado após 1 vínculo rascunhado, a 2ª linha vê base restante 3000
        const {deltaCents: ok} = calcDeltaVincularCents(
            1000,
            [item()],
            valorById,
            new Map([[tituloId, 1000]]),
        );
        assert.equal(ok, -200_000);
    });
});

describe("buildVincularFormSchema — submit silencioso (regressão)", () => {
    it("gap no extrato com juros=0: cobertura parcial OK (não bloqueia)", () => {
        const valorById = new Map<number, string | number>([[1, 1000]]);
        const schema = buildVincularFormSchema(8000, valorById);
        const parsed = schema.safeParse({
            gerar_parcial: false,
            residuo_lancamento_id: null,
            itens: [
                {
                    lancamento_id: 1,
                    selecionado: true,
                    desconto: "",
                    juros_multa: "",
                },
            ],
        });
        assert.equal(parsed.success, true);
    });

    it("residuo_lancamento_id vazio string vira null (não quebra z.number)", () => {
        const valorById = new Map<number, string | number>([
            [1, 5000],
            [2, 5000],
        ]);
        const schema = buildVincularFormSchema(8000, valorById);
        const parsed = schema.safeParse({
            gerar_parcial: true,
            residuo_lancamento_id: "",
            itens: [
                {lancamento_id: 1, selecionado: true, desconto: "", juros_multa: ""},
                {lancamento_id: 2, selecionado: true, desconto: "", juros_multa: ""},
            ],
        });
        // Δ = 8000−10000 < 0 → residual exige origem válida
        assert.equal(parsed.success, false);
        if (!parsed.success) {
            const paths = parsed.error.issues.map((i) => i.path.join("."));
            assert.ok(paths.includes("residuo_lancamento_id"));
        }
    });

    it("Modo B parcial (1 título > extrato): submit OK sem residual", () => {
        const valorById = new Map<number, string | number>([[99, 4000]]);
        const schema = buildVincularFormSchema(1000, valorById, new Map([[99, 0]]));
        const parsed = schema.safeParse({
            gerar_parcial: false,
            residuo_lancamento_id: null,
            itens: [
                {lancamento_id: 99, selecionado: true, desconto: "", juros_multa: ""},
            ],
        });
        assert.equal(parsed.success, true);
    });
});
