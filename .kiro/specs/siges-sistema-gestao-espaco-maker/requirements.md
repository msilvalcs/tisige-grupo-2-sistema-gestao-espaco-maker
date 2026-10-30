# Requirements Document

## Introduction

O SIGES (Sistema Integrado de Gestão do Espaço Maker) é uma aplicação web desenvolvida para o Espaço Maker da PUC Minas (Unidade Coração Eucarístico). O sistema centraliza e automatiza a gestão operacional do laboratório de fabricação digital, cobrindo agendamento de equipamentos, controle de insumos, monitoramento de status de impressoras 3D, registro de manutenções e geração de métricas operacionais.

O frontend é construído em React e o backend em Node.js com Express, expondo uma API REST consumida pelo cliente.

---

## Glossary

- **SIGES**: Sistema Integrado de Gestão do Espaço Maker — o sistema descrito neste documento.
- **Usuário**: Pessoa autenticada que interage com o SIGES (aluno, técnico ou administrador do espaço maker).
- **Administrador**: Usuário com permissão para cadastrar e editar equipamentos, insumos e manutenções.
- **Equipamento**: Impressora 3D (FDM ou resina) ou cortadora a laser cadastrada no sistema.
- **Agendamento**: Reserva de um equipamento por um usuário para uma janela de tempo específica.
- **Insumo**: Material consumível utilizado pelos equipamentos (filamento, resina, material de corte a laser), identificado por nome, categoria e unidade de medida.
- **Estoque**: Quantidade disponível de um insumo em determinado momento.
- **Limite de alerta**: Quantidade mínima configurada para um insumo, abaixo da qual o sistema emite alerta de estoque baixo.
- **Status do Equipamento**: Estado operacional atual de um equipamento — Disponível, Imprimindo, Manutenção ou Inativo.
- **Status do Insumo**: Estado derivado da quantidade em estoque — Em estoque, Estoque baixo ou Sem estoque.
- **Status do Agendamento**: Estado do ciclo de vida de uma reserva — Agendado, Confirmado, Em andamento, Concluído ou Cancelado.
- **KPI**: Indicador-chave de desempenho exibido no dashboard e nos módulos.
- **Taxa de ocupação**: Percentual de equipamentos ativos em relação ao total de equipamentos cadastrados e operacionais.
- **Dashboard**: Tela de visão geral com KPIs, agenda do dia e resumo de estoque.
- **API**: Interface de programação de aplicação REST exposta pelo backend Node.js/Express.
- **JWT**: JSON Web Token usado para autenticação de sessão.

---

## Requirements

### Requirement 1: Autenticação de Usuários

**User Story:** Como usuário do espaço maker, quero me autenticar no SIGES com minhas credenciais, para que apenas pessoas autorizadas acessem o sistema.

#### Acceptance Criteria

1. WHEN um usuário submete um e-mail com formato válido que corresponda a um usuário cadastrado e a senha correta desse usuário, THE SIGES SHALL autenticar o usuário e retornar um JWT com validade de 8 horas.
2. WHEN um usuário submete um e-mail com formato válido que não corresponda a nenhum usuário cadastrado, ou uma senha incorreta para um usuário existente, THE SIGES SHALL retornar um erro com mensagem "E-mail ou senha incorretos" e código HTTP 401.
3. WHILE um usuário está autenticado, THE SIGES SHALL incluir o nome do usuário nas respostas de perfil para exibição da saudação personalizada.
4. WHEN o JWT de um usuário expirar, THE SIGES SHALL rejeitar as requisições subsequentes com código HTTP 401 e mensagem "Sessão expirada".
5. IF um usuário tentar acessar qualquer rota protegida com JWT ausente, inválido ou expirado, THEN THE SIGES SHALL redirecionar o usuário para a tela de login.
6. THE SIGES SHALL armazenar senhas utilizando hash bcrypt com fator de custo mínimo de 10.
7. WHEN o usuário submete o formulário de login com o campo e-mail em branco, senha em branco, ou e-mail com formato inválido, THE SIGES SHALL exibir mensagens de validação indicando cada campo inválido sem enviar a requisição ao servidor.

---

### Requirement 2: Dashboard — Visão Geral

**User Story:** Como usuário autenticado, quero visualizar um painel centralizado com os principais indicadores operacionais, para que eu possa acompanhar o estado do espaço maker em tempo real.

#### Acceptance Criteria

1. WHEN o usuário acessa o Dashboard, THE SIGES SHALL exibir uma saudação personalizada com o nome do usuário e o período do dia calculado com base no horário do servidor: "Bom dia" entre 05:00 e 11:59, "Boa tarde" entre 12:00 e 17:59 e "Boa noite" entre 18:00 e 04:59.
2. WHEN o usuário acessa o Dashboard, THE SIGES SHALL exibir o KPI "Impressoras ativas" como a contagem de equipamentos com status Disponível ou Imprimindo, seguida do total de equipamentos cadastrados (ex: "08 / 10").
3. WHEN o usuário acessa o Dashboard, THE SIGES SHALL exibir o KPI "Reservas hoje" como a contagem de agendamentos com data de início igual à data atual do servidor.
4. WHEN o usuário acessa o Dashboard, THE SIGES SHALL exibir o KPI "Insumos em alerta" como a contagem de insumos com status Estoque baixo ou Sem estoque.
5. WHEN o usuário acessa o Dashboard, IF nenhum equipamento tiver status Disponível ou Imprimindo, THEN THE SIGES SHALL exibir o KPI "Taxa de ocupação" como "0%"; caso contrário, THE SIGES SHALL exibir o percentual de equipamentos com status Imprimindo em relação ao total de equipamentos com status Disponível ou Imprimindo, arredondado para o inteiro mais próximo.
6. WHEN o usuário acessa o Dashboard, IF não houver agendamentos para o dia corrente, THEN THE SIGES SHALL exibir uma mensagem indicando que não há agendamentos para o dia na seção "Agenda de hoje"; caso contrário, THE SIGES SHALL listar todos os agendamentos do dia corrente ordenados por horário de início crescente, com as colunas: horário de início, nome do equipamento, nome do usuário responsável e status do agendamento.
7. WHEN o usuário acessa o Dashboard, THE SIGES SHALL exibir o painel "Estoque de insumos" com os insumos com status Estoque baixo ou Sem estoque em destaque visual (texto e barra de progresso na cor vermelha), e os demais insumos com barra de progresso na cor azul.
8. WHEN o usuário clica no botão "+ Novo agendamento" no cabeçalho do Dashboard, THE SIGES SHALL redirecionar o usuário para a página do formulário de criação de agendamento.

---

### Requirement 3: Módulo de Agendamentos — Criação de Reserva

**User Story:** Como usuário autenticado, quero reservar um equipamento para uma janela de tempo específica com o material necessário, para que eu possa planejar meu uso do espaço maker com antecedência.

#### Acceptance Criteria

1. WHEN o usuário acessa o formulário de novo agendamento, THE SIGES SHALL exibir os equipamentos cadastrados agrupados por categoria (Todas, Impressoras FDM, Impressoras Resina, Laser), com nome, material carregado atualmente e status de cada equipamento.
2. WHEN o usuário seleciona um equipamento com status Imprimindo ou Manutenção ou Inativo, THE SIGES SHALL impedir a seleção e exibir a mensagem "Equipamento indisponível para agendamento".
3. WHEN o usuário preenche todos os campos obrigatórios (equipamento, material, data de início, hora de início, duração estimada entre 1 e 1440 minutos, peso estimado entre 1 e 99999 gramas) e confirma o agendamento, THE SIGES SHALL criar o agendamento com status Agendado e retornar código HTTP 201.
4. WHEN o usuário confirma um agendamento, THE SIGES SHALL verificar se existe sobreposição de horário para o mesmo equipamento e, IF houver conflito, THEN THE SIGES SHALL rejeitar a criação com mensagem "Horário conflitante com agendamento existente" e código HTTP 409.
5. WHEN um agendamento é criado com sucesso, THE SIGES SHALL deduzir o peso estimado (em gramas) do estoque do insumo selecionado.
6. IF o estoque do insumo selecionado for insuficiente para cobrir o peso estimado do agendamento, THEN THE SIGES SHALL exibir um aviso ao usuário e solicitar confirmação antes de prosseguir; IF o usuário recusar, THEN THE SIGES SHALL manter o formulário aberto sem criar o agendamento.
7. WHEN o usuário submete o formulário com campos obrigatórios em branco ou com valores fora dos limites definidos, THE SIGES SHALL exibir mensagens de validação indicando cada campo inválido sem enviar a requisição ao servidor.
8. WHEN o usuário clica em "Cancelar" no formulário de agendamento, THE SIGES SHALL descartar o formulário e retornar para a tela anterior sem criar agendamento.
9. IF o usuário informar uma data e hora de início anteriores ao momento atual, THEN THE SIGES SHALL exibir uma mensagem de validação indicando que a data e hora de início não podem ser no passado, sem enviar a requisição ao servidor.

---

### Requirement 4: Módulo de Agendamentos — Listagem e Gerenciamento

**User Story:** Como usuário autenticado, quero visualizar e gerenciar meus agendamentos existentes, para que eu possa acompanhar o status das minhas reservas e cancelá-las quando necessário.

#### Acceptance Criteria

1. WHEN o usuário acessa "Meus Agendamentos", THE SIGES SHALL exibir todos os agendamentos do usuário autenticado, ordenados por data de início decrescente.
2. WHEN o usuário visualiza a lista de agendamentos, THE SIGES SHALL exibir para cada item: nome do equipamento, data e hora de início, duração estimada, material, peso estimado, status e, para agendamentos com status Agendado ou Confirmado, a ação "Cancelar".
3. WHEN o usuário cancela um agendamento com status Agendado ou Confirmado, THE SIGES SHALL atualizar o status do agendamento para Cancelado e restituir o peso estimado ao estoque do insumo correspondente.
4. IF um agendamento tiver status Em andamento, Concluído ou Cancelado, THEN THE SIGES SHALL impedir o cancelamento e exibir a mensagem "Agendamento não pode ser cancelado neste status".
5. WHEN o usuário acessa "Meus Agendamentos" sem possuir nenhum agendamento, THE SIGES SHALL exibir uma mensagem indicando que não há agendamentos registrados.

---

### Requirement 5: Módulo de Equipamentos — Cadastro e Monitoramento

**User Story:** Como administrador, quero cadastrar e monitorar os equipamentos do espaço maker, para que eu possa controlar a disponibilidade e o histórico de uso de cada máquina.

#### Acceptance Criteria

1. WHEN o administrador acessa o módulo de Equipamentos, THE SIGES SHALL exibir KPIs: total de equipamentos cadastrados, equipamentos em operação (status Disponível ou Imprimindo), em manutenção e inativos.
2. WHEN o administrador acessa o módulo de Equipamentos, THE SIGES SHALL exibir uma tabela com todos os equipamentos cadastrados, contendo as colunas: nome do equipamento, modelo, status, localização, data da última manutenção e ações de editar dados e alterar status do equipamento.
3. WHEN o administrador cadastra um novo equipamento fornecendo nome, modelo, categoria (FDM, Resina ou Laser), localização e status inicial (Disponível, Imprimindo, Manutenção ou Inativo), THE SIGES SHALL persistir o equipamento e retornar código HTTP 201.
4. WHEN o administrador edita um equipamento alterando nome, modelo, categoria, localização ou status, THE SIGES SHALL atualizar os dados do equipamento e retornar código HTTP 200.
5. WHEN o administrador altera o status de um equipamento para Inativo, THE SIGES SHALL impedir a criação de novos agendamentos para esse equipamento.
6. THE SIGES SHALL exibir o status de cada equipamento com indicação visual: Disponível (verde), Imprimindo (azul), Manutenção (amarelo), Inativo (vermelho).
7. WHEN o administrador submete o formulário de cadastro de equipamento com campos obrigatórios ausentes, THE SIGES SHALL retornar código HTTP 422 com detalhes dos campos inválidos.
8. IF o administrador submete o cadastro ou a edição de um equipamento com categoria ou status fora dos valores permitidos, THEN THE SIGES SHALL rejeitar a operação e retornar código HTTP 422 com detalhes dos campos inválidos.

---

### Requirement 6: Módulo de Insumos — Controle de Estoque

**User Story:** Como administrador, quero cadastrar e controlar o estoque de insumos do espaço maker, para que eu possa acompanhar o consumo e ser alertado quando os níveis estiverem críticos.

#### Acceptance Criteria

1. WHEN o administrador acessa o módulo de Insumos, THE SIGES SHALL exibir KPIs: total de insumos cadastrados, insumos em estoque, insumos com estoque baixo e insumos sem estoque.
2. WHEN o administrador acessa o módulo de Insumos, THE SIGES SHALL exibir uma tabela paginada com 9 insumos por página, contendo as colunas: nome, categoria, quantidade, unidade, status e ações.
3. THE SIGES SHALL calcular o status de cada insumo da seguinte forma: Sem estoque quando quantidade igual a zero; Estoque baixo quando quantidade maior que zero e menor ou igual ao limite de alerta configurado; Em estoque quando quantidade maior que o limite de alerta.
4. WHEN o administrador filtra insumos por categoria ou status, THE SIGES SHALL atualizar a tabela exibindo apenas os insumos que correspondem aos filtros selecionados, reiniciando a paginação para a primeira página.
5. WHEN o administrador digita no campo de pesquisa por nome, THE SIGES SHALL filtrar a tabela exibindo apenas os insumos cujo nome contenha a string digitada, sem diferenciação de maiúsculas e minúsculas, atualizando os resultados em até 300 milissegundos após a entrada de cada caractere.
6. WHEN o administrador cadastra um novo insumo fornecendo nome (entre 1 e 100 caracteres), categoria (Filamento, Resina ou Corte Laser), quantidade inicial (entre 0 e 1.000.000,00), unidade (g, ml ou un) e limite de alerta (entre 0 e 1.000.000,00), THE SIGES SHALL persistir o insumo e retornar código HTTP 201.
7. WHEN o administrador edita a quantidade de um insumo para um valor maior ou igual a zero, THE SIGES SHALL recalcular o status do insumo imediatamente após a atualização.
8. IF a quantidade de um insumo atingir ou ficar abaixo do limite de alerta após qualquer operação de dedução de estoque, THEN THE SIGES SHALL registrar o evento de alerta e incrementar o KPI "Insumos em alerta" no Dashboard.
9. THE SIGES SHALL aceitar as categorias de insumo: Filamento, Resina e Corte Laser.
10. THE SIGES SHALL aceitar as unidades de medida: g (gramas), ml (mililitros) e un (unidades).
11. IF o administrador cadastra um insumo com nome fora do intervalo de 1 a 100 caracteres, quantidade inicial fora do intervalo de 0 a 1.000.000,00, ou limite de alerta fora do intervalo de 0 a 1.000.000,00, THEN THE SIGES SHALL rejeitar o cadastro e retornar código HTTP 422 com detalhes indicando os campos inválidos.
12. IF o administrador edita a quantidade de um insumo para um valor menor que zero, THEN THE SIGES SHALL rejeitar a edição e manter a quantidade anterior ao valor editado.

---

### Requirement 7: Módulo de Manutenção — Registro e Controle

**User Story:** Como administrador, quero registrar e acompanhar as manutenções periódicas dos equipamentos, para que eu possa garantir a vida útil das máquinas e prevenir falhas.

#### Acceptance Criteria

1. WHEN o administrador cadastra uma manutenção informando equipamento, data de realização, descrição e data prevista para a próxima manutenção, THE SIGES SHALL persistir o registro e atualizar o campo "Última manutenção" do equipamento correspondente.
2. WHEN o administrador acessa o módulo de Manutenção, THE SIGES SHALL exibir a lista de manutenções registradas, ordenadas por data de realização em ordem decrescente, com: nome do equipamento, data da última manutenção, data da próxima manutenção prevista e status (Em dia ou Atrasada).
3. IF a data prevista para a próxima manutenção de um registro for anterior à data atual do servidor, THEN THE SIGES SHALL classificar o status desse registro de manutenção como Atrasada.
4. IF a data prevista para a próxima manutenção de um registro for igual ou posterior à data atual do servidor, THEN THE SIGES SHALL classificar o status desse registro de manutenção como Em dia.
5. WHILE a manutenção mais recente registrada para um equipamento tiver status Atrasada, THE SIGES SHALL definir o status do equipamento como Manutenção na listagem de equipamentos.
6. WHEN o administrador registra uma manutenção cuja data prevista para a próxima manutenção for igual ou posterior à data atual do servidor, IF o equipamento estava com status Manutenção, THEN THE SIGES SHALL atualizar o status do equipamento para Disponível.
7. WHEN o administrador registra uma manutenção cuja data prevista para a próxima manutenção for igual ou posterior à data atual do servidor, IF o equipamento estava com status Disponível, Imprimindo ou Inativo, THEN THE SIGES SHALL manter o status do equipamento inalterado.
8. IF o administrador submete o cadastro de manutenção sem informar todos os campos obrigatórios (equipamento, data de realização, descrição e data prevista para a próxima manutenção) ou com a data prevista para a próxima manutenção anterior ou igual à data de realização, THEN THE SIGES SHALL rejeitar o cadastro, indicar os campos inválidos e não persistir o registro.

---

### Requirement 8: Módulo de Métricas de Impressão

**User Story:** Como administrador, quero visualizar métricas consolidadas de uso do espaço maker, para que eu possa analisar o desempenho operacional e tomar decisões baseadas em dados.

#### Acceptance Criteria

1. WHEN o administrador acessa o módulo de Métricas, THE SIGES SHALL exibir os KPIs: total de filamento consumido (em kg, calculado somando os pesos consumidos em gramas de todos os agendamentos com status Concluído cujo insumo seja da categoria Filamento, dividindo por 1000 e arredondando para uma casa decimal), total de projetos concluídos (contagem de agendamentos com status Concluído), total de projetos interrompidos (contagem de agendamentos com status Cancelado) e total de manutenções realizadas (contagem de registros de manutenção persistidos).
2. WHEN o administrador acessa o módulo de Métricas, THE SIGES SHALL exibir a tabela "Uso de Filamento por Projeto" listando todos os agendamentos com status Concluído cujo insumo seja da categoria Filamento, com as colunas: nome do agendamento (usado como identificador do projeto), material utilizado e quantidade consumida em gramas.
3. WHEN o administrador acessa o módulo de Métricas, THE SIGES SHALL exibir a lista "Projetos Interrompidos" listando todos os agendamentos com status Cancelado, com as colunas: nome do agendamento, motivo do cancelamento e data do cancelamento.
4. WHEN o administrador acessa o módulo de Métricas, THE SIGES SHALL exibir a tabela "Manutenções por Impressora" com as colunas: nome da impressora, data da última manutenção, data da próxima manutenção prevista, horas de uso acumuladas (valor inteiro em horas) e status da manutenção (Em dia ou Atrasada), aplicando as mesmas regras de classificação definidas no Requisito 7.
5. THE SIGES SHALL calcular as horas de uso acumuladas de cada equipamento somando as durações estimadas em minutos de todos os agendamentos com status Concluído associados a esse equipamento e convertendo o total para horas inteiras por truncamento.
6. WHEN o administrador cancela um agendamento com status Agendado ou Confirmado, THE SIGES SHALL exigir o preenchimento de um campo de motivo do cancelamento (texto livre, máximo 255 caracteres) antes de confirmar a operação, persistindo o motivo junto ao registro do agendamento.

---

### Requirement 9: Navegação e Layout Global

**User Story:** Como usuário autenticado, quero uma navegação consistente e acessível entre todos os módulos do sistema, para que eu possa me mover pelo SIGES de forma eficiente em qualquer tela.

#### Acceptance Criteria

1. THE SIGES SHALL exibir uma barra lateral de navegação em todas as telas autenticadas, contendo as seções: VISÃO GERAL (Dashboard, Agendamentos) e OPERAÇÃO (Equipamentos, Insumos, Manutenção), onde cada item é um link navegável para a seção correspondente.
2. THE SIGES SHALL exibir no topo da barra lateral a identidade "SIGES" e no rodapé da barra lateral o texto "Espaço Maker PUC Minas / Unidade Coração Eucarístico".
3. WHEN o usuário navega para uma seção, THE SIGES SHALL destacar visualmente o item correspondente na barra lateral como ativo, distinguindo-o dos demais itens inativos.
4. THE SIGES SHALL exibir um cabeçalho em todas as telas autenticadas contendo o caminho de navegação atual (breadcrumb) refletindo a seção e o módulo ativos, e o botão "+ Novo agendamento".
5. WHEN o usuário acessa o SIGES em um dispositivo com largura de tela inferior a 768px, THE SIGES SHALL adaptar o layout ocultando a barra lateral e exibindo um controle de menu hamburguer que, ao ser acionado, exibe os mesmos itens de navegação da barra lateral.

---

### Requirement 10: API REST — Contratos e Consistência

**User Story:** Como desenvolvedor do frontend, quero que a API REST do SIGES siga convenções consistentes, para que a integração entre frontend e backend seja previsível e fácil de manter.

#### Acceptance Criteria

1. THE SIGES API SHALL expor endpoints RESTful agrupados pelos recursos: `/auth`, `/users`, `/equipamentos`, `/agendamentos`, `/insumos`, `/manutencoes` e `/metricas`.
2. THE SIGES API SHALL retornar respostas no formato JSON com Content-Type `application/json` em todos os endpoints.
3. IF uma requisição à API resultar em erro de validação, THEN THE SIGES API SHALL retornar código HTTP 422 com um objeto JSON contendo o campo `errors` listando os campos inválidos e suas mensagens descritivas.
4. IF uma requisição à API resultar em erro interno do servidor, THEN THE SIGES API SHALL retornar código HTTP 500 com uma mensagem genérica sem expor detalhes de implementação ou stack trace.
5. IF uma requisição for direcionada a uma rota protegida (todos os endpoints exceto `/auth`) e contiver um JWT ausente ou inválido, THEN THE SIGES API SHALL rejeitar a requisição com código HTTP 401.
6. IF um usuário autenticado sem privilégios de administrador tentar executar uma operação restrita a administradores, THEN THE SIGES API SHALL rejeitar a requisição indicando permissões insuficientes.
7. IF uma requisição à API referenciar um recurso inexistente, THEN THE SIGES API SHALL retornar uma resposta de erro indicando que o recurso não foi encontrado.
