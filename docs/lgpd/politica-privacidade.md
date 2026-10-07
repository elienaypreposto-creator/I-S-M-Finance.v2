# Política de privacidade (minuta, multiempresa)

Minuta para publicação. Pendente de revisão jurídica e do nome do encarregado. Data da minuta: 2026-10-05.

## Quem é quem

O sistema é usado por várias empresas, separadas. A empresa em que o usuário entra é a controladora dos dados de negócio que ela própria lança (parceiros, extratos, lançamentos). A organização que opera o sistema é a operadora desses dados.

Um usuário de uma empresa não recebe, por esta política, acesso aos dados de outra. O isolamento é técnico (`empresa_id`). Operação que atravessa empresas (exportar ou eliminar uma empresa) fica restrita a superadmin do operador, a pedido da empresa controladora.

## Que dados entram

Os descritos no inventário versão 1.0: identificação de acesso (nome, e-mail, telefone), dados de parceiros incluindo CPF/CNPJ e pix, dados financeiros de lançamento e extrato, e logs de segurança (IP, user agent). Não há campo próprio para dado sensível. Texto livre pode acabá-lo por acidente; a empresa controladora deve evitar isso.

Não guardamos o ficheiro OFX. Guardamos as linhas importadas e o nome do ficheiro.

## Para quê

Prestar o serviço contratado, cumprir guarda fiscal pelo prazo do inventário, e proteger a conta (sessão, permissão, auditoria).

## Quanto tempo

Extrato: 5 anos, depois marcado como arquivado, sem apagamento automático do lançamento. Auditoria quente: 24 meses, depois arquivo. Eliminação da empresa: a pedido, em duas etapas, com auditoria anonimizada em vez de apagada. Senha não entra na exportação.

## Com quem

Com a hospedagem necessária a correr o serviço, listada no acordo de tratamento da empresa. Sem venda de base. Sem uso da base de uma empresa para outra.

## Direitos

Pedido de acesso, correção, portabilidade ou eliminação do titular segue pela empresa controladora. O operador executa exportação e eliminação por empresa quando o controlador pede. Eliminação de uma empresa não apaga usuário que também pertence a outra empresa; só retira o vínculo e as permissões daquela.

## Encarregado

Canal: encarregado@ism.finance. Cargo e ocupação: `docs/lgpd/encarregado.md`.

## Incidentes

Comunicação às empresas afectadas segundo `docs/lgpd/plano-incidente.md`, com referência operacional de 72 horas a contar da ciência quando houver risco relevante.
