-- Add sortOrder to CardPlayer for throw-order tracking
ALTER TABLE "CardPlayer" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
