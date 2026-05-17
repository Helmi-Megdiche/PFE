# Database setup (local dev)

## Option A — Docker (recommended, matches `.env` defaults)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```powershell
cd backend
npm run db:setup
npm run dev
```

This starts PostgreSQL with `postgres` / `postgres` on port `5432` and runs migrations.

## Option B — Existing PostgreSQL install

Edit `backend/.env` and set your real credentials:

```env
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/pfe_parental_control
```

Create the database:

```sql
CREATE DATABASE pfe_parental_control;
```

Run migrations:

```powershell
npm run db:migrate
npm run dev
```

## If port 5432 is already in use (your case)

You have **PostgreSQL 18** running locally (`postgresql-x64-18`). Docker cannot bind to port 5432 until you stop that service.

**Fix:** set the password you chose when installing PostgreSQL 18 in `.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_REAL_PASSWORD@localhost:5432/pfe_parental_control
```

Create the database in **pgAdmin** or **psql**:

```sql
CREATE DATABASE pfe_parental_control;
```

Then:

```powershell
npm run db:migrate
npm run dev
```

### Forgot the postgres password?

Reset it in psql (run as admin) or via pgAdmin → Login/Group Roles → postgres → Definition.

### Prefer Docker instead?

1. Stop Windows service: `Stop-Service postgresql-x64-18` (or Services app)
2. Start **Docker Desktop**
3. `npm run db:setup`
