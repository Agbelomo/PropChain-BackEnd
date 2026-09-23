
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_status_check" CHECK ("status" IN ('PENDING', 'COMPLETED', 'CANCELLED'));