# Inventário de dados pessoais

Versão 1.0. Data: 2026-10-05. Autor da versão: engenharia.
Revisão interna registrada em 2026-10-09 por Vinicius Costa (encarregado) e Gabriel Pedro (implementação). Escopo: classes do inventário, bases do art. 7º (V, II e IX) e prazos operacionais de extrato e auditoria. Não é parecer de escritório externo.

O operador trata dados das empresas clientes. Cada empresa cliente é a fonte dos dados de negócio (parceiros, extratos, lançamentos). O operador trata usuários que entram no sistema, sessão, tokens e logs.

Não há, neste schema, coluna de dado pessoal sensível no sentido do art. 5º, II, da LGPD (origem racial, saúde, biometria, opinião política, dado de criança como categoria própria, etc.). Onde o texto livre pode carregar esse tipo de dado por acidente, a linha está marcada como incidente.

Legenda:

- pessoal: identifica ou pode identificar pessoa natural
- financeiro: dado de conta, valor, pix ou movimento
- sensível: art. 5º, II. Neste schema, não há coluna dedicada
- técnico: identificador interno, estado, data de sistema

Base legal usada na operação (revisão interna de 2026-10-09):

- contrato: art. 7º, V, para cadastro da empresa cliente e dos usuários que ela autoriza
- obrigação legal: art. 7º, II, para lançamento, extrato e conciliação enquanto o prazo fiscal não vence
- legítimo interesse: art. 7º, IX, para log de segurança, minimizado

## Prazos que o sistema aplica

| Dado | Prazo | O que o código faz |
| --- | --- | --- |
| Extrato (`periodo_fim`, ou `created_at` se o período vier vazio) | `PRAZO_EXTRATO_ANOS` = 5 anos | Job `retencao-lgpd` preenche `extratos.arquivado_em`. Não apaga a linha. |
| `logs_auditoria` | `PRAZO_AUDITORIA_MESES` = 24 meses na tabela quente | Job de arquivo move para `logs_auditoria_arquivo` e apaga a cópia quente. |
| `logs_auditoria` e arquivo, na eliminação da empresa | Conserva o facto, sem dado pessoal | `UPDATE`: zera ip, user agent, request id, usuário e detalhes. Mantém `empresa_id`, ação, recurso e data. |
| `refresh_tokens` | Até expirar ou ser revogado | Na eliminação de usuário exclusivo da empresa, o token fica revogado. |
| Demais tabelas da empresa | Vida do contrato e, no financeiro, o prazo de 5 anos | Saem só na eliminação pedida pelo controlador, depois da confirmação em duas etapas. |

Os dois prazos numéricos saem de `artifacts/api-server/src/domains/lgpd/lgpd-prazos.ts` (`PRAZO_EXTRATO_ANOS`, `PRAZO_AUDITORIA_MESES`). O job não define outro número.

## Empresas

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| id, slug, ativa, created_at, updated_at | técnico | contrato | até a eliminação |
| razao_social, nome_fantasia, cnpj | pessoal (pessoa jurídica; o CNPJ pode apontar sócios fora deste sistema) | contrato | até a eliminação |

## Usuários e acesso

`usuarios` não tem `empresa_id`. O vínculo é `usuario_empresas`.

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| usuarios.nome, email, telefone, celular, cargo, perfil_base | pessoal | contrato | enquanto houver vínculo com alguma empresa; se o usuário só existia na empresa eliminada, a linha é anonimizada |
| usuarios.senha_hash, senha_unica_hash | segredo, não sai na exportação | contrato | substituído na anonimização |
| usuarios.superadmin, bloqueado, ultimo_acesso | técnico, com rastro de uso | contrato / legítimo interesse | acompanha a conta |
| usuario_empresas.papel, ativo | técnico | contrato | apagado com a empresa |
| usuario_permissoes.codigo_permissao | técnico | contrato | apagado com a empresa |
| refresh_tokens.token_hash | segredo | contrato | revogado; a linha não tem empresa_id |
| tokens_api.descricao, escopos, token_preview, last_used_at, last_used_ip | pessoal no IP; o resto é técnico | contrato | apagado com a empresa. `token_hash` não entra no pacote |

## Parceiros

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| nome, nome_fantasia, email, telefone, cpf_cnpj, tipo_pessoa | pessoal (CPF é pessoal; CNPJ é de pessoa jurídica) | contrato, e obrigação legal quando o parceiro entra em lançamento fiscal | 5 anos se houve lançamento; senão, até a eliminação |
| chaves_pix, dados_bancarios | pessoal e financeiro | contrato / obrigação legal | igual ao lançamento |
| tipos, forma_pagamento_preferencial, departamento_id, centro_custo_id, ativo, bloqueado, status | técnico | contrato | até a eliminação |

## Contas, plano, estrutura

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| contas_bancarias.banco, agencia, digito_agencia, conta, digito_conta, titular, nome | financeiro; titular pode ser pessoal | obrigação legal | 5 anos |
| contas_bancarias.saldo_inicial, data_inicio, tipo, status, cor | financeiro ou técnico | obrigação legal | 5 anos |
| plano_contas.tipo, categoria, subcategoria, codigo, ativo | técnico | obrigação legal | 5 anos |
| filiais.nome, departamentos.nome, centros_custos.nome | técnico (pode coincidir com nome de pessoa no texto livre) | contrato | até a eliminação |
| metas.ano, mes, valor_projetado | financeiro | contrato | até a eliminação |
| parametros_sistema.chave, valor | técnico; `valor` é texto livre | contrato | até a eliminação |

## Lançamentos

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| valor, valor_quitado, juros, multa, desconto, acrescimo, vencimento, competencia, data_quitacao, forma_pagamento, dados_pagamento | financeiro; `dados_pagamento` pode trazer chave pix ou conta | obrigação legal | 5 anos, depois só por eliminação pedida. Não há job que apague lançamento. |
| descricao | pessoal incidente e financeiro | obrigação legal | 5 anos |
| tipo, status, origem, parcela_atual, total_parcelas, riscos, is_residuo_parcial, transferencia_grupo_id | técnico | obrigação legal | 5 anos |
| criado_por | pessoal (id de usuário) | contrato | 5 anos |

## Extrato e conciliação

O ficheiro OFX não fica guardado. Ficam `extratos.arquivo_nome`, `arquivo_hash` e as linhas em `extrato_linhas`. O pacote de exportação repete essas linhas em `extratos_arquivos`.

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| extratos.periodo_inicio, periodo_fim, totais, saldo_final_banco, arquivo_nome, arquivo_hash, status | financeiro | obrigação legal | 5 anos; depois `arquivado_em` |
| extrato_linhas.valor, descricao, documento, observacao, data_movimento, identificador_externo | financeiro; descrição e documento são pessoais incidentes | obrigação legal | acompanha o extrato |
| regras_conciliacao.texto_gatilho | pessoal incidente (texto de extrato) | contrato | até a eliminação |
| conciliacoes, itens_conciliacao, itens_conciliacao_lancamentos, historico_conciliacao | financeiro; `detalhes` e `descricao` são texto livre | obrigação legal | 5 anos junto do extrato |

## Kanban

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| kanban_cards.titulo, descricao, responsavel_nome, checklist, tags | pessoal incidente | contrato | até a eliminação |
| kanban_comentarios.comentario | pessoal | contrato | até a eliminação |
| kanban_anexos.nome_arquivo, url | pessoal incidente; o binário, se existir, está no URL e não neste banco | contrato | até a eliminação |
| kanban_historico.comentario, colunas | pessoal incidente | contrato | até a eliminação |

## Auditoria e log de sistema

| Coluna | Classe | Base | Retenção |
| --- | --- | --- | --- |
| logs_auditoria.ip, user_agent, request_id, usuario_id, detalhes | pessoal | legítimo interesse | 24 meses na tabela quente; arquivo em seguida. Na eliminação da empresa, estas colunas são limpas. `empresa_id`, `acao`, `recurso`, `status_code`, `created_at` ficam. |
| logs_auditoria_arquivo | igual à tabela quente | legítimo interesse | conserva o mesmo tratamento na eliminação. Sem FK para `empresas`. |
| logs_sistema.mensagem, detalhes | pode citar o id da empresa e o id do operador na eliminação. Não leva dado do cliente. | legítimo interesse | log operacional, sem prazo automático neste card |

## O que a exportação inclui

`GET /api/admin/empresas/:id/export` (superadmin) devolve 202 e um `job_id`. O mesmo GET com `?job_id=` devolve, quando pronto, um link `/api/admin/exportacoes/:token` válido por 15 minutos. O JSON traz a empresa, as tabelas com `empresa_id`, os usuários vinculados sem hash de senha, e `extratos_arquivos`. O hash do token de API não entra.

A eliminação está descrita em `docs/lgpd/operacao-tecnica.md`.
