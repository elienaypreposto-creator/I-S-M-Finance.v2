-- Dono das tabelas deixa de ser SUPERUSER.
--
-- Justificativa (ISMF-30): ism_user continua SUPERUSER só porque o compose
-- usa POSTGRES_USER=ism_user (bootstrap + pg_dump no workflow). Não entra
-- no pool HTTP. Objectos em public passam a ism_owner (NOSUPERUSER).
-- O schema drizzle fica no bootstrap (ism_user) para o journal do db:migrate.
-- BYPASSRLS: migrate.ts tenta ALTER ROLE ism_owner BYPASSRLS (docker
-- SUPERUSER). No Supabase o hook bloqueia; retenção no TST corre no compose.
-- Senha: migrate.ts / ISM_OWNER_PASSWORD - não neste ficheiro.

ALTER ROLE ism_owner LOGIN;--> statement-breakpoint

DO
$$
    DECLARE
        obj record;
        kind text;
    BEGIN
        FOR obj IN
            SELECT n.nspname AS sch, c.relname AS rel, c.relkind
            FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
              AND pg_get_userbyid(c.relowner) = current_user
            LOOP
                kind := CASE obj.relkind
                            WHEN 'v' THEN 'VIEW'
                            WHEN 'm' THEN 'MATERIALIZED VIEW'
                            WHEN 'S' THEN 'SEQUENCE'
                            ELSE 'TABLE'
                    END;
                EXECUTE format('ALTER %s %I.%I OWNER TO ism_owner', kind, obj.sch, obj.rel);
            END LOOP;
    END
$$;--> statement-breakpoint

GRANT ism_owner TO CURRENT_USER;--> statement-breakpoint

GRANT USAGE, CREATE ON SCHEMA public TO ism_owner;--> statement-breakpoint
DO
$$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
            EXECUTE 'GRANT USAGE, CREATE ON SCHEMA drizzle TO ism_owner';
        END IF;
    END
$$;--> statement-breakpoint

DO
$$
    BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO ism_owner', current_database());
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL;
    END
$$;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE ism_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ism_app, ism_admin;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE ism_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO ism_app, ism_admin;--> statement-breakpoint

REVOKE UPDATE, DELETE ON TABLE logs_auditoria FROM ism_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE logs_auditoria TO ism_app;--> statement-breakpoint
REVOKE ALL ON TABLE logs_auditoria_arquivo FROM ism_app;
