-- Reverte os novos objetos e o privilégio acrescentado nesta migration.
DROP TABLE request_limits;
REVOKE DELETE ON delivery_limits FROM operaon_app;
