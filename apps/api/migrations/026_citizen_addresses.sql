-- 026_citizen_addresses.sql
-- Populate profile_jsonb.addresses for existing test citizens.
-- Non-destructive: merges into existing profile without overwriting applicant.

UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"H.No. 2301, Sector 20","line2":"","city":"Mohali","state":"Punjab","district":"SAS Nagar","pincode":"160020"},"communication":{"same_as_permanent":true,"line1":null,"line2":null,"city":null,"state":null,"district":null,"pincode":null}}'::jsonb,
  true
) WHERE user_id = 'test-citizen-1';

UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"H.No. 1147, Sarabha Nagar","line2":"","city":"Ludhiana","state":"Punjab","district":"Ludhiana","pincode":"141001"},"communication":{"same_as_permanent":false,"line1":"Office No. 45, Mall Road","line2":"Near Clock Tower","city":"Ludhiana","state":"Punjab","district":"Ludhiana","pincode":"141008"}}'::jsonb,
  true
) WHERE user_id = 'test-citizen-2';

UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"H.No. 3278, Block C, Ranjit Avenue","line2":"","city":"Amritsar","state":"Punjab","district":"Amritsar","pincode":"143001"},"communication":{"same_as_permanent":true,"line1":null,"line2":null,"city":null,"state":null,"district":null,"pincode":null}}'::jsonb,
  true
) WHERE user_id = 'test-citizen-3';

UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"H.No. 2156, Model Town Extension","line2":"","city":"Jalandhar","state":"Punjab","district":"Jalandhar","pincode":"144003"},"communication":{"same_as_permanent":false,"line1":"Shop No. 12, GT Road","line2":"Near Bus Stand","city":"Jalandhar","state":"Punjab","district":"Jalandhar","pincode":"144001"}}'::jsonb,
  true
) WHERE user_id = 'test-citizen-4';

UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"Flat No. 1089, Sector 4, Leela Bhawan","line2":"","city":"Patiala","state":"Punjab","district":"Patiala","pincode":"147001"},"communication":{"same_as_permanent":true,"line1":null,"line2":null,"city":null,"state":null,"district":null,"pincode":null}}'::jsonb,
  true
) WHERE user_id = 'test-citizen-5';

-- Also populate for 'testcitizen' if it exists (CI/demo user)
UPDATE "user" SET profile_jsonb = jsonb_set(
  COALESCE(profile_jsonb, '{}'::jsonb),
  '{addresses}',
  '{"permanent":{"line1":"Test Address Line 1","line2":"","city":"Mohali","state":"Punjab","district":"SAS Nagar","pincode":"140100"},"communication":{"same_as_permanent":true,"line1":null,"line2":null,"city":null,"state":null,"district":null,"pincode":null}}'::jsonb,
  true
) WHERE login = 'testcitizen' AND profile_jsonb IS NOT NULL;
