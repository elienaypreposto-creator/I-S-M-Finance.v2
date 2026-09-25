-- ISMF-15/18: PUBLIC herdava DELETE/UPDATE de grants antigos (push).
-- Sem isto, ism_app ainda conseguia tentar DELETE e a policy rebentava
-- com `''::int` em vez de permission denied.
-- Policy endurecida: string vazia trata-se como NULL (nega tudo).

REVOKE ALL ON TABLE logs_auditoria FROM PUBLIC;--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE logs_auditoria FROM ism_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE logs_auditoria TO ism_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE logs_auditoria TO ism_admin;--> statement-breakpoint

DO
$$
    DECLARE
        t      text;
        tables text[] := ARRAY [
            'filiais',
            'departamentos',
            'centros_custos',
            'contas_bancarias',
            'plano_contas',
            'parceiros',
            'lancamentos',
            'metas',
            'regras_conciliacao',
            'extratos',
            'extrato_linhas',
            'conciliacoes',
            'itens_conciliacao',
            'itens_conciliacao_lancamentos',
            'historico_conciliacao',
            'kanban_cards',
            'kanban_comentarios',
            'kanban_anexos',
            'kanban_historico',
            'parametros_sistema',
            'logs_auditoria',
            'tokens_api'
            ];
        expr   text := '(NULLIF(current_setting(''app.empresa_id'', true), ''''))::int';
    BEGIN
        FOREACH t IN ARRAY tables
            LOOP
                IF to_regclass('public.' || t) IS NULL THEN
                    CONTINUE;
                END IF;
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
                EXECUTE format(
                        'CREATE POLICY tenant_isolation ON %I
                           FOR ALL
                           USING (empresa_id = %s)
                           WITH CHECK (empresa_id = %s)',
                        t, expr, expr
                        );
            END LOOP;
    END
$$;
