# Backend and Database

This backend stores assessment form data in MySQL.

## Default database

The app uses the database name from `DB_NAME` in `backend/.env`.
For new installs, the default is `shehersaaz_forms`.

## What gets saved

- `household_info` stores household assessment rows.
- `socio` stores socioeconomic assessment rows.
- `engineering` stores engineering assessment rows.
- `inventory` stores inventory assessment rows.
- `assessment_status` stores the submission status for each household and form stage.

The form tables are flat, Excel-ready tables without raw JSON columns.

## How the save flow works

1. The browser submits a form to `/api/forms/.../submit` or `/api/households`.
2. `backend/src/server.js` receives the request and validates the payload.
3. `backend/src/db.js` writes the data into MySQL inside a transaction.
4. The same request also updates the household row and the submission status row.

## How to view the data

Use any MySQL client, then run queries like:

```sql
USE shehersaaz_forms;
SELECT * FROM household_info ORDER BY updated_at DESC;
SELECT * FROM socio ORDER BY updated_at DESC;
SELECT * FROM engineering ORDER BY updated_at DESC;
SELECT * FROM inventory ORDER BY updated_at DESC;
SELECT * FROM assessment_status ORDER BY updated_at DESC;
```

You can also inspect a combined snapshot through:

- `GET /api/db`
- `GET /api/export?dataset=households&format=csv`
- `GET /api/export?dataset=seaf&format=csv`
- `GET /api/export?dataset=engineering&format=csv`
- `GET /api/export?dataset=inventory&format=csv`
- `GET /api/export?dataset=snapshot&format=json`

Supported export datasets:

- `households`
- `household-info`
- `submitted-forms`
- `status`
- `form-submissions`
- `socio`
- `seaf`
- `engineering`
- `inventory`
- `snapshot` (JSON only)

## Local setup

1. Copy `backend/.env.example` to `backend/.env` if needed.
2. Update the MySQL credentials for your machine or deployment.
3. Run `npm install` in `backend/`.
4. Start the app with `npm start` from the project root.
5. Open `http://127.0.0.1:3000/pages/index.html` for the forms or `http://127.0.0.1:3000/pages/admin-dashboard/index.html` for the admin login.

## Project structure

- `frontend/` contains the static UI files such as `pages/`, `assets/`, and `sw.js`.
- `backend/` contains the Node.js server, database config, and MySQL logic.
- The project root keeps shared top-level files such as `package.json`, logs, and SQL files.
