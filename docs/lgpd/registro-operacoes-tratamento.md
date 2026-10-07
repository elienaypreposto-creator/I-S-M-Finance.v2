# Registro de operações de tratamento (art. 37 da LGPD)

Versão 1.0. Data: 2026-10-05. Operador do sistema. Cada empresa cliente mantém o próprio registro na qualidade de controlador; este ficheiro cobre o que o operador faz.

| Operação | Dados | Titulares | Base usada na operação | Partilha | Retenção |
| --- | --- | --- | --- | --- | --- |
| Conta de acesso da empresa cliente | razão social, CNPJ, usuários (nome, e-mail, telefone) | pessoas que a empresa autoriza; a empresa em si | contrato | hospedagem, conforme lista do DPA | vida do contrato; usuário exclusivo é anonimizado na eliminação |
| Lançamento, conta bancária, parceiro, extrato, conciliação | valores, descrições, documentos, pix, CPF/CNPJ de parceiro | parceiros pessoa natural e usuários citados no texto | obrigação legal e contrato | não há partilha de negócio entre empresas | 5 anos no extrato (arquivo, sem apagar); eliminação só a pedido, depois desse dever |
| Sessão e token de API | hash de sessão, preview de token, IP de uso | usuários | contrato | não | sessão até revogar; token até a eliminação da empresa |
| Auditoria | acção, recurso, IP, user agent, detalhes | usuários que chamam a API | legítimo interesse | não | 24 meses na tabela quente, depois arquivo; na eliminação da empresa, anonimizar e conservar o facto |
| Exportação a pedido do controlador | pacote JSON da empresa | os mesmos do inventário | contrato (pedido do controlador) | link de 15 minutos, só superadmin autenticado | ficheiro temporário no disco do processo |
| Eliminação a pedido do controlador | todo o domínio da empresa | os mesmos | contrato e, quando couber, pedido do titular via controlador | registo do operador em `logs_sistema`, sem dado do cliente | auditoria anonimizada permanece |
| Resposta a incidente | categorias afectadas, empresas, medidas | titulares das empresas afectadas | obrigação de segurança / legítimo interesse | empresas afectadas e, se decidido, autoridade | conforme o plano de incidente |

Não há operação de venda de dado, perfilamento para publicidade, nem decisão automatizada com efeito jurídico neste sistema.

Revisão jurídica deste registro: pendente.
