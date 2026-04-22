CREATE DATABASE IF NOT EXISTS shehersaaz_forms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shehersaaz_forms;

CREATE TABLE IF NOT EXISTS households (
  household_id VARCHAR(64) NOT NULL PRIMARY KEY,
  survey_date VARCHAR(32) NULL,
  city VARCHAR(120) NULL,
  ucnc VARCHAR(120) NULL,
  address TEXT NULL,
  catchment_area VARCHAR(60) NULL,
  tank_space VARCHAR(60) NULL,
  enumerator_name VARCHAR(160) NULL,
  head_name VARCHAR(160) NULL,
  respondent_name VARCHAR(160) NULL,
  respondent_cnic VARCHAR(40) NULL,
  head_cnic VARCHAR(40) NULL,
  respondent_gender VARCHAR(40) NULL,
  eligibility_status VARCHAR(40) NULL,
  status VARCHAR(40) NULL,
  cmo_name VARCHAR(160) NULL,
  engineer_name VARCHAR(160) NULL,
  engineer_employment_code VARCHAR(160) NULL,
  stage_status JSON NULL,
  raw_data JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submitted_forms (
  household_id VARCHAR(64) NOT NULL PRIMARY KEY,
  head_name VARCHAR(160) NULL,
  household_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  seaf_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  engineering_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  inventory_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT submitted_forms_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS form_submissions (
  household_id VARCHAR(64) NOT NULL,
  form_key VARCHAR(32) NOT NULL,
  payload JSON NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (household_id, form_key),
  CONSTRAINT form_submissions_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generated_ids (
  household_id VARCHAR(64) NOT NULL PRIMARY KEY,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT generated_ids_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seaf_responses (
  household_id VARCHAR(64) NOT NULL PRIMARY KEY,
  response JSON NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT seaf_responses_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
