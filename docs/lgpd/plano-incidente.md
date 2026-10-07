# Plano de resposta a incidente

Versão 1.0. Data: 2026-10-05.
A LGPD não escreve "72 horas" no texto. O prazo abaixo é referência de mercado, alinhada à prática usada com a ANPD e ao art. 33 do GDPR, para incidente com risco ou dano relevante aos titulares. A revisão jurídica pode apertar ou alargar. Quem decide e quem comunica é o encarregado interno: administração da plataforma, canal encarregado@ism.finance, conta admin@ism.finance.

## Quem faz o quê

| Função | Faz | Não faz |
| --- | --- | --- |
| Quem detecta | Engenharia de plantão, ou qualquer pessoa com acesso ao alerta, ao log ou ao relato de um cliente. Abre o registo na hora em que souber. | Não comunica o cliente por conta própria. |
| Quem decide | Encarregado, com o responsável técnico. Classifica: sem risco relevante, ou com risco/dano aos titulares. | Não espera o fim da correção para classificar. |
| Quem comunica | Encarregado. Fala com as empresas afectadas e, se a decisão for essa, com a ANPD. | A engenharia não envia a nota no lugar do encarregado. |

## Prazos

| Marco | Prazo |
| --- | --- |
| Registo interno a partir da ciência | Imediato. Meta operacional: 1 hora. |
| Decisão de comunicar | Assim que houver indício de risco relevante. Não esperar o relatório final. |
| Comunicação às empresas afectadas e, se couber, à autoridade | 72 horas a contar da ciência. |
| Complemento (o que ainda não se sabia nas 72 horas) | Sem prazo fixo; enviar quando souber, no mesmo fio. |

A ciência é o momento em que alguém da operação soube do facto, não o momento em que o relatório ficou pronto.

## O que registar

Número, data e hora da ciência, quem detectou, sistemas, empresas afectadas (`empresa_id` se já conhecido), tipo de dado do inventário, o que já foi contido, decisão, hora da comunicação.

## Nota às empresas afectadas

Assunto: Incidente de segurança com possível efeito sobre dados tratados em vosso nome

> Tomámos conhecimento, em [data e hora], de um incidente em [sistema].
> Empresas afectadas: [razão social / identificador que o cliente reconhece].
> Dados possivelmente envolvidos: [categorias do inventário, sem despejar a base].
> O que já fizemos: [contenção].
> O que pedimos da vossa parte: [acção concreta, ou "nenhuma neste momento"].
> Próxima actualização: [data].
> Contacto do encarregado: [canal, quando existir].

Não incluir palavra-passe, token, dump, nem dado de outra empresa.

## Simulação

Exercício de mesa registado em 2026-10-05, das 14:50 às 15:20 (UTC-3), no fecho deste documento. Não foi enviado a cliente nenhum. Os papéis são os da tabela acima.

Cenário: o link de exportação da empresa A aparece num ticket aberto pela empresa B.

| Campo | Registo |
| --- | --- |
| Data do exercício | 2026-10-05, 14:50–15:20 (UTC-3) |
| Cenário | Link `/api/admin/exportacoes/:token` da empresa A colado no ticket da empresa B |
| Quem detectou | Plantão de engenharia, ao ler o ticket (14:50) |
| Quem decidiu | Encarregado (canal encarregado@ism.finance), com o responsável técnico (14:55): há risco relevante para os titulares da empresa A |
| Quem comunicou | Encarregado, com o modelo desta página. No exercício a nota ficou no registo; não saiu para uma empresa real |
| Hora da ciência | 2026-10-05 14:50 (UTC-3) |
| Hora da nota de teste | 2026-10-05 15:10 (UTC-3) |
| Coube em 72 horas | Sim. Da ciência à nota: 20 minutos |
| Falha encontrada | O guest da VM não mostra cifra de disco do provedor. O backup de deploy estava em SQL legível; passou a ser cifrado antes de tocar o disco (`scripts/lgpd-cifrar-backup.sh`) |
| Correcção | Backup só em `.sql.enc`. `ISM_DISCO_CIFRADO` no deploy passa a reflectir o `lsblk`, não um flag escrito à mão |
