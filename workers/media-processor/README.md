# Processador de mídia MANU (sem Python)

Vídeos são enviados diretamente do navegador ao Supabase Storage e entram em uma fila PostgreSQL (`manu_media_jobs`). O vídeo fica disponível em sua qualidade original enquanto o worker executa. Quando a conversão produz arquivo menor, ele substitui a mídia do post; se não houver ganho, mantém o original.

## Execução

1. Execute `supabase/migrations/202611020002_manu_media_jobs.sql` no SQL Editor, após a migration anterior de 02/11.
2. Instale FFmpeg 6+ com encoder `libx264` em um computador/VPS ou contêiner que permaneça ligado. Confirme com `ffmpeg -encoders`.
3. Instale dependências do projeto com `npm install` na raiz.
4. Defina `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `MEDIA_PROCESSOR_ENABLED=true` **no ambiente privado do worker**, nunca em `NEXT_PUBLIC_`.
5. Rode `node workers/media-processor/worker.mjs`. Para processar apenas um item: `node workers/media-processor/worker.mjs --once`.

**A Vercel não hospeda esse worker permanente.** Use VPS, computador dedicado ou um job agendado em servidor que possua Node.js, FFmpeg e acesso HTTPS ao Supabase. O site continua funcionando sem ele, mas vídeos permanecerão sem otimização.

Limites: arquivos MP4/WebM até 25 MB, até 3 minutos convertidos, 720p, H.264/AAC. Metadados são descartados. A qualidade real depende da origem; não é possível prometer nenhuma redução sem perda de qualidade.

O worker conserva o original em caso de erro. Após quatro falhas registra `failed` para análise. Secrets de servidor **nunca** devem ser enviados ao navegador nem comitados no Git.

## Docker (sem instalar FFmpeg manualmente)

No servidor com Docker instalado, copie `workers/media-processor/.env.example` para `workers/media-processor/.env.worker`, preencha a cópia **somente no servidor** e rode dentro da pasta do worker:

```bash
docker compose -f compose.yml up -d --build
```

O contêiner inclui FFmpeg e inicia novamente após reinício. Não hospede esse contêiner na Vercel. Use um VPS ou serviço de contêineres. `.env.worker` deve continuar fora do Git e de qualquer ZIP compartilhado.
