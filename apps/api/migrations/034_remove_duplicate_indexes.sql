-- M8: Remove indexes that duplicate unique constraints or composite index coverage
-- idx_fee_demand_arn on fee_demand(arn) is fully covered by idx_fee_demand_arn_status on fee_demand(arn, status)
-- idx_decision_arn on decision(arn) is covered by idx_decision_arn_type on decision(arn, decision_type)

DROP INDEX IF EXISTS idx_fee_demand_arn;
DROP INDEX IF EXISTS idx_decision_arn;
