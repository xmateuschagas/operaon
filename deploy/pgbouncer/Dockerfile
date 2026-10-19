# Pacote do repositório oficial Alpine; não depende de imagem comunitária de PgBouncer.
FROM alpine:3.22 AS package
RUN apk add --no-cache pgbouncer postgresql16-client
FROM package AS runtime
COPY deploy/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
USER 1000:1000
EXPOSE 6432
HEALTHCHECK --interval=20s --timeout=5s CMD pg_isready -h 127.0.0.1 -p 6432 || exit 1
ENTRYPOINT ["pgbouncer"]
CMD ["/etc/pgbouncer/pgbouncer.ini"]
