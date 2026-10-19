-- Remove apenas os objetos introduzidos nesta sessão.
DROP TABLE delivery_limits;
DROP INDEX idx_reminder_message;
ALTER TABLE appointment_reminders DROP COLUMN message_id,DROP COLUMN generation;
