-- Save current state for restoration
CREATE TEMP TABLE current_usage AS 
SELECT * FROM usage_counters WHERE org_id = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77';

-- Test Scenario 1: Warning state (80%+ usage)
-- SMS: 160/200 (80%), Email: 400/500 (80%)
UPDATE usage_counters 
SET sms_sent = 160, emails_sent = 400, updated_at = NOW()
WHERE org_id = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77' 
  AND period_start = '2025-09-01 00:00:00'
  AND period_end = '2025-10-01 00:00:00';

SELECT 'SCENARIO 1: Warning State (80% usage)' as test_name;
SELECT sms_sent, emails_sent FROM usage_counters 
WHERE org_id = 'a5309a76-ee4a-4c2f-b12b-6b79bae4ae77';
