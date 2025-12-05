# Autenticação integrada entre Dashboard e Módulo Repositores

## Contexto
O login deve ocorrer apenas no **Dashboard Germani Alimentos**. O módulo **Repositores** reaproveita o usuário já autenticado, sem solicitar novo formulário ou entrada de username.

## Como o Dashboard deve salvar a sessão
Após validar o usuário na tabela `users` (banco comercial), grave o contexto no `localStorage` usando a chave `GERMANI_AUTH_USER`:

```js
const userContext = {
  id: usuario.id,        // id na tabela users
  username: usuario.username,
  loggedAt: new Date().toISOString()
};

localStorage.setItem('GERMANI_AUTH_USER', JSON.stringify(userContext));
```

O header do dashboard pode continuar exibindo o `username` lido desse objeto.

## Como o módulo Repositores consome o login
- Ao carregar, o módulo lê `GERMANI_AUTH_USER` para obter `id` e `username` e montar `usuarioLogado`.
- Se a chave não existir ou estiver inválida, a tela mostra uma mensagem para voltar ao dashboard e autenticar-se, sem exibir formulário de login.
- As permissões continuam sendo avaliadas por `acl_usuario_tela` no Turso, usando o `id` retornado pelo dashboard.

## Boas práticas
- Limpe a chave `GERMANI_AUTH_USER` ao efetuar logout no dashboard.
- Garanta que os fluxos de navegação que levam ao módulo Repositores apenas sejam liberados após o login, evitando telas sem contexto de usuário.
