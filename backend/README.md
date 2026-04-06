backend:
npm install express cors helmet dotenv jsonwebtoken bcryptjs morgan express-rate-limit
npm install --save-dev nodemon

Database (Prisma): copy `.env.example` to `.env`, set `DATABASE_URL`, then:
`npx prisma generate` (after pulls) and `npx prisma migrate deploy` (or `migrate dev`) when Postgres is up.

Shared Prisma client: `src/db.js` (uses `@prisma/adapter-pg` + `DATABASE_URL`; requires env when imported).

Needed: postgres setup, connection string 

frontend:
npm install
