-- Daily/monthly quota counts filter projects by (userId, createdAt).
CREATE INDEX "projects_userId_createdAt_idx" ON "projects"("userId", "createdAt");

-- Ledger lookups by project (generation settlement, reconciliation).
CREATE INDEX "credit_ledger_projectId_idx" ON "credit_ledger"("projectId");
