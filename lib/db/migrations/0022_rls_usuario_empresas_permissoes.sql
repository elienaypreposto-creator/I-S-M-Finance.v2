-- Isolamento SELECT/INSERT em vínculos e permissões por tenant.
-- Login e refresh correm SEM SET LOCAL: a policy permite leitura quando o
-- GUC está vazio, para listEmpresas / fetchPermissions continuarem a funcionar.
-- Com SET LOCAL (rotas autenticadas com tenant), só a empresa da sessão.

DO
$$
    DECLARE
        t    text;
        expr text := '(NULLIF(current_setting(''app.empresa_id'', true), ''''))::int';
        pred text;
    BEGIN
        FOREACH t IN ARRAY ARRAY ['usuario_empresas', 'usuario_permissoes']
            LOOP
                IF to_regclass('public.' || t) IS NULL THEN
                    CONTINUE;
                END IF;
                pred := format(
                    '(%s IS NULL OR empresa_id = %s)',
                    expr,
                    expr
                );
                EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
                EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
                EXECUTE format(
                    'CREATE POLICY tenant_isolation ON %I
                       FOR ALL
                       USING (%s)
                       WITH CHECK (%s)',
                    t,
                    pred,
                    pred
                );
            END LOOP;
    END
$$;
