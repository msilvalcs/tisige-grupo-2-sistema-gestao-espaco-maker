# Requisitos e decisões do MVP

Referências: issues #3 a #26, artigo em docs/01-introducao.md e protótipo original TISIGE. Data desta base: 22/10/2026, America/Sao_Paulo.

## Escopo e regras implementadas

Impressão 3D é o núcleo: FDM usa g; resina usa ml. Laser fica fora da primeira entrega. Não se converte massa em volume sem densidade. Precisão de quantidade: três casas decimais.

Usuários possuem ID UUID, nome, e-mail único normalizado, senha com scrypt e estado ativo. A sessão tem token aleatório de 256 bits, com somente o hash persistido; expira em 8 horas. O cliente usa cookie HttpOnly e SameSite Strict, Secure em produção. A autoria de movimentos vem da sessão e ignora IDs de autor enviados pelo cliente.

Projetos têm responsável e estado ativo. Usuários comuns consultam e alteram seus próprios projetos. Gestores podem gerenciar todos os projetos e os cadastros operacionais. A matriz abaixo representa a política provisória implementada para desenvolvimento, ainda sujeita à validação da equipe.

| Operação | Usuário | Gestor |
| --- | --- | --- |
| Consultar equipamentos e insumos/histórico | Sim | Sim |
| Gerenciar projetos próprios | Sim | Sim |
| Gerenciar projetos de terceiros | Não | Sim |
| Cadastrar pessoas e definir perfil | Não | Sim |
| Gerenciar equipamentos e insumos | Não | Sim |
| Alterar estoque com motivo | Não | Sim |

Não há exclusão destrutiva. Inativação conserva registros e relações. Tecnologia/unidade de um material com movimentações não pode ser alterada. Quantidades físicas só mudam por movimentos assinados pela sessão; cada movimento registra motivo, data, quantidade e saldo resultante.

Saldo disponível = físico - reservado. Sem estoque significa disponível zero; estoque baixo significa disponível positivo e menor ou igual ao mínimo. O contador de alertas inclui ambos, somente para insumos ativos. Reservado existe na modelagem, mas não é alterado nesta etapa sem agendamento implementado.

## Decisões propostas, pendentes de validação

| Tema | Proposta | Situação |
| --- | --- | --- |
| Perfis | Usuário e gestor conforme matriz acima | Provisória para a base; validar equipe |
| Reserva | Confirmar reserva compromete saldo; início converte em baixa estimada | Não implementada; validar equipe |
| Cancelamento | Antes do início libera reservado; após início conserva consumo | Não implementado; validar equipe |
| Encerramento | Registrar consumo real e compensar diferença com rastreabilidade | Não implementado; validar equipe |
| Reagendamento | Revalidar intervalo, manutenção e material atomicamente | Não implementado; validar equipe |
| Status | Atualização operacional manual; telemetria fora do MVP | Proposta |
| Latência | Reconsulta de status em até 5 segundos, com timestamp e indicação de falha | Proposta, não implementada |

Fluxo proposto: confirmada > em execução > concluída ou interrompida. Cancelamento antes do início é terminal. Intervalos devem usar [início, fim), com fim estritamente posterior ao início. Concorrência e reenvio devem ser protegidos no banco e na API. Não se deve simular uma agenda funcional enquanto essas regras não forem validadas.

## Entidades futuras

Agendamento deverá vincular solicitante identificado, projeto, equipamento, material, intervalo, estimativa, estado e chave de idempotência. Execução registra início, fim e consumo real. Manutenção registra equipamento, responsável, intervalo de indisponibilidade, motivo, periodicidade e conclusão. Vínculos históricos precisam ser preservados ao inativar cadastros.

## Requisitos não funcionais

- Persistência PostgreSQL, migrações repetíveis e transações para integridade.
- Nenhum saldo negativo em concorrência; precisão decimal no banco.
- Validação na API, SQL parametrizado e permissão no servidor.
- Erros de validação e conexão explícitos; dados antigos não aparecem como atualizados após falha.
- Interface em pt-BR, unidade explícita, foco visível, formulários rotulados, diálogo com foco contido e layout adaptável.
- Testes HTTP com banco real e testes de navegador em 1440x1000 e 390x844.
- Metas de carga, recuperação, disponibilidade e latência operacional dependem da validação da equipe. Esta entrega não declara metas ainda não medidas.

## Rastreabilidade

| Requisito | Tela / módulo | Teste ou pendência | Issues |
| --- | --- | --- | --- |
| RF01 requisitos e regras | Este documento | Propostas explícitas; aprovação pendente | #4 |
| RF02 usuário e projeto | Login, Pessoas, Projetos | Sessão, autoria, projetos; vínculo com reserva pendente | #5, #6 |
| RF03 equipamentos | Equipamentos | Cadastro, duplicidade, edição/inativação, recarga; detalhes e reserva pendentes | #8 |
| RF04 status | Futuro módulo operacional | Atualização manual de cadastros; sincronização de estados pendente | #9 |
| RF05 manutenção | Futuro módulo | Pendente | #10 |
| RF06 insumos | Insumos | Unidades, mínimo, inativação; paginação e filtros avançados pendentes | #12 |
| RF07 movimentos | Insumos, Histórico | Autoria, precisão, saldo negativo e concorrência; filtros e vínculo à reserva pendentes | #13 |
| RF08 escassez | Visão geral, Insumos | Alertas derivados da consulta; ciclo com reserva pendente | #14 |
| RF09 agenda | Futuro módulo | Pendente | #16, #17 |
| RF10 baixa automática | Futuro módulo | Pendente de validação de política | #18, #19 |
| RF11 indicadores | Visão geral | Contagens reais; ocupação e consumo por período pendentes | #21 |
| RF12 validação | Testes e documentação | Base funcional testada; manutenção, ciclo e participantes pendentes | #24, #25, #26 |

A matriz relaciona testes em tests/api.test.mjs e tests/e2e/foundation.spec.mjs. Nenhum épico foi considerado concluído apenas pela existência da base.
