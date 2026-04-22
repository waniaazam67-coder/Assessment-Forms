# Backend and Database

This backend stores assessment form data in MySQL.

## Default database

The app uses the database name from `DB_NAME` in `backend/.env`.
For new installs, the default is `shehersaaz_forms`.

## What gets saved

- `households` stores the household profile and household assessment snapshot.
- `submitted_forms` stores the submission status for each household and form stage.
- `form_submissions` stores the raw submitted payload for each form.
- `seaf_responses` stores socioeconomic form responses.
- `generated_ids` stores household IDs that have been created.

## How the save flow works

1. The browser submits a form to `/api/forms/.../submit` or `/api/households`.
2. `backend/src/server.js` receives the request and validates the payload.
3. `backend/src/db.js` writes the data into MySQL inside a transaction.
4. The same request also updates the household row and the submission status row.

## How to view the data

Use any MySQL client, then run queries like:

```sql
USE shehersaaz_forms;
SELECT * FROM households ORDER BY updated_at DESC;
SELECT * FROM submitted_forms ORDER BY updated_at DESC;
SELECT * FROM form_submissions ORDER BY submitted_at DESC;
```

You can also inspect a combined snapshot through:

- `GET /api/db`

## Local setup

1. Copy `backend/.env.example` to `backend/.env` if needed.
2. Update the MySQL credentials for your machine or deployment.
3. Run `npm install` in `backend/`.
4. Start the app with `npm start` from the project root.
