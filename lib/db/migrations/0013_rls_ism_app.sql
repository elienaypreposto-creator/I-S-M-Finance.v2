-- ISMF-15: role de aplicação sem BYPASSRLS + RLS FORCE nas tabelas com empresa_id.
-- ISMF-18: REVOKE UPDATE/DELETE em logs_auditoria (depende de ism_app).
--
-- Migrations continuam a correr com a role dona (DATABASE_URL). A app faz
-- SET ROLE ism_app no pool padrão. Superadmin usa ism_admin (BYPASSRLS)
-- só em rotas administrativas — nunca no pool default.

DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_app') THEN
            CREATE ROLE ism_app
                NOSUPERUSER
                NOBYPASSRLS
                NOCREATEDB
                NOCREATEROLE
                NOLOGIN
                INHERIT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_admin') THEN
            CREATE ROLE ism_admin
                NOSUPERUSER
                BYPASSRLS
                NOCREATEDB
                NOCREATEROLE
                NOLOGIN
                INHERIT;
        END IF;
    END
$$;--> statement-breakpoint

GRANT ism_app TO CURRENT_USER;--> statement-breakpoint
GRANT ism_admin TO CURRENT_USER;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO ism_app, ism_admin;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ism_app, ism_admin;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ism_app, ism_admin;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ism_app, ism_admin;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO ism_app, ism_admin;--> statement-breakpoint

-- Append-only: a app lê e insere auditoria; não apaga nem reescreve (ISMF-18).
REVOKE UPDATE, DELETE ON TABLE logs_auditoria FROM ism_app;--> statement-breakpoint

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
    BEGIN
        FOREACH t IN ARRAY tables
            LOOP
                IF to_regclass('public.' || t) IS NULL THEN
                    CONTINUE;
                END IF;
                EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
                EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
                EXECUTE format(
                        'CREATE POLICY tenant_isolation ON %I
                           FOR ALL
                           USING (empresa_id = current_setting(''app.empresa_id'', true)::int)
                           WITH CHECK (empresa_id = current_setting(''app.empresa_id'', true)::int)',
                        t
                        );
            END LOOP;
    END
$$;
