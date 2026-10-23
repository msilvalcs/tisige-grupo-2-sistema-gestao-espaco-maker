# Validação da base funcional

Data: 22/10/2026. Ambiente: Windows, Node.js 24.8, PostgreSQL 17.6 local real, API Express e React/Vite. Fuso: America/Sao_Paulo. As capturas do Figma anteriores continuam sendo evidências do protótipo, não da aplicação.

## Resultado

- 9 testes HTTP de integração passaram com banco PostgreSQL temporário.
- 10 testes de navegador passaram, cinco cenários em desktop (1440x1000) e celular (390x844).
- Lint, formatação e build verificados.
- npm audit não encontrou vulnerabilidades na execução local.
- Migrações e seed executados duas vezes no teste para verificar repetibilidade.

## Cenários comprovados

| Cenário | Esperado | Obtido |
| --- | --- | --- |
| Sessão e senha | Negar senha inválida, manter identificação após recarga, invalidar no logout | Passou |
| Acesso anônimo | HTTP 401 em recurso protegido | Passou |
| Perfil comum | Sem botões de gestão; HTTP 403 em alterações indevidas | Passou |
| Projetos | Cadastrar, persistir, editar e inativar sem perder responsável | Passou |
| Autoria de projeto | Impedir alterar projeto de terceiro e atribuição indevida | Passou |
| Equipamentos | Cadastro persistido e duplicidade informada | Passou |
| Materiais | Unidade deriva de tecnologia; mínimo e saldo coerentes | Passou |
| Estoque | Entrada persistida e histórico com autor da sessão | Passou |
| Precisão | Rejeitar quatro casas decimais | Passou |
| Último saldo | De duas saídas concorrentes, só uma conclui | Passou |
| Saldo insuficiente | HTTP 409 e mensagem no formulário, sem baixa parcial | Passou |
| Mudança de unidade com histórico | HTTP 409, preservando unidade original | Passou |

O teste concorrente começa com 10,125 ml e envia duas saídas de 10 ml. Resultados esperados e obtidos: um HTTP 201, um HTTP 409 e saldo final 0,125 ml; somente a saída vencedora entra no histórico.

## Limitações e cobertura das issues

#4 possui documento de requisitos e propostas; falta a validação da equipe. #5 cobre identificação e permissões dos módulos entregues, mas autorização das futuras reservas/manutenções depende dessas implementações. #6 possui projetos com responsável, ainda sem reserva. #8 possui cadastro, edição e inativação, ainda sem integração com reserva e tela de detalhes dedicada. #12 a #14 possuem a base de estoque, mas sem paginação, filtros completos e integração com agenda. #24 ainda não tem massa de manutenção agendada. #25 não representa aprovação do ciclo completo da impressão. #26 exige participantes reais.

A execução de navegador adiciona dados E2E no banco de desenvolvimento. Capturas e relatório são gerados pelo Playwright. A revisão visual observou desktop e celular; não equivale a auditoria completa de acessibilidade ou teste de usabilidade com participantes.

Nenhuma issue é encerrada por esta entrega e nenhuma política proposta é apresentada como aprovada.


## Capturas revisadas

- [Visão geral desktop](evidencias/base-desktop.png)
- [Visão geral celular](evidencias/base-mobile.png)

As capturas incluem dados E2E criados pelas execuções anteriores. Os contadores refletem esses registros persistidos.
