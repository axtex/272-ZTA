backend:
npm install express cors helmet dotenv jsonwebtoken bcryptjs morgan express-rate-limit
npm install --save-dev nodemon

Database (PostgreSQL + Prisma):

1. From the **repo root**, start Postgres (optional but matches the default URL in `.env.example`):

   `docker compose up -d`

2. In `backend/`, copy `.env.example` to `.env` and set `DATABASE_URL`.

   - **Docker (above):** use the URL already in `.env.example`.
   - **Hosted (Neon, Supabase, Railway, …):** paste your provider’s connection string. Share a team dev URL outside git (1Password, etc.); do not commit secrets.

3. Install and apply schema:

   `npm install`  
   `npm run db:generate`  
   `npm run db:migrate`  
   `npm run db:seed` (optional sample data)

After pulls, run `npm run db:generate` and `npm run db:migrate` if migrations changed.

Shared Prisma client: `src/db.js` (`@prisma/adapter-pg` + `DATABASE_URL`).

frontend:
npm install
