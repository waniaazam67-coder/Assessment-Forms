USE shehersaaz_forms;

SHOW TABLES;

-- Latest household records saved by the forms
SELECT
  household_id,
  head_name,
  city,
  status,
  updated_at
FROM households
ORDER BY updated_at DESC
LIMIT 20;

-- Submission status per household
SELECT
  household_id,
  head_name,
  household_status,
  seaf_status,
  engineering_status,
  inventory_status,
  updated_at
FROM submitted_forms
ORDER BY updated_at DESC
LIMIT 20;

-- Raw payloads submitted from the forms
SELECT
  household_id,
  form_key,
  payload,
  submitted_at
FROM form_submissions
ORDER BY submitted_at DESC
LIMIT 20;

-- Socioeconomic responses, if any
SELECT
  household_id,
  response,
  submitted_at
FROM seaf_responses
ORDER BY submitted_at DESC
LIMIT 20;
