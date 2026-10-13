# Painel de Pendências

Painel Kanban colaborativo para acompanhar ocorrências fora da rotina mensal.

## Executar

Requer Node.js 20 ou superior.

```bash
npm start
```

Acesse `http://localhost:3000`. No primeiro acesso, cadastre o administrador. Ele poderá criar os acessos individuais da equipe pelo botão **Equipe**.

Os dados ficam em `data/db.json`, diretório ignorado pelo Git. Em produção, faça backup desse diretório e use HTTPS no proxy que publicar a aplicação.

## Publicar no Railway

1. No Railway, crie um projeto com **Deploy from GitHub repo** e selecione este repositório.
2. No serviço criado, adicione um **Volume** montado em `/data`.
3. Em **Variables**, crie `DATA_DIR=/data`.
4. Em **Settings > Networking**, gere um domínio público.
5. Abra o domínio e cadastre o primeiro administrador.

O arquivo `railway.json` configura o comando de inicialização, a política de reinício e a verificação de saúde em `/health`. O volume é obrigatório para manter usuários e pendências entre novas implantações.
