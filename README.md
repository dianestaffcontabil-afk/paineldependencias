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

## Testar no Render

1. No Render, escolha **New > Blueprint**.
2. Conecte o repositório `dianestaffcontabil-afk/paineldependencias`.
3. Confirme o serviço definido em `render.yaml` e inicie a implantação.
4. Quando o status ficar **Live**, abra a URL fornecida e cadastre o administrador.

O Blueprint usa o plano gratuito para teste. Nesse plano, `DATA_DIR=/tmp/painel-data` é temporário: usuários e pendências podem ser perdidos quando o serviço reiniciar ou for publicado novamente. Para operação real, use armazenamento persistente.
