-- Backport the reservation-confirmation rule to databases that already ran
-- 002 before the inline PostgreSQL constraint name was corrected.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_check;
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_reserved_check;
ALTER TABLE materials ADD CONSTRAINT materials_reserved_check CHECK (reserved >= 0);
