# Ferramentas operacionais aprovadas em D27, separadas das imagens de aplicação.
FROM postgres:16-alpine
RUN apk add --no-cache restic openssh-client tzdata
COPY deploy/backup*.sh /opt/operaon/deploy/
ENV TZ=America/Sao_Paulo
ENTRYPOINT ["sh", "/opt/operaon/deploy/backup-run.sh"]
