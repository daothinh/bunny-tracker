# Pug Bunny Tricker

Dashboard quan tri de thu thap, tong hop va quan ly target bug bounty web3 chi tu GitHub repositories.

## Valid repository rules

Repo duoc giu lai khi thoa man ca hai dieu kien:

1. Co it nhat mot topic nam trong allowlist web3.
2. Co it nhat mot security signal trong `README` hoac `SECURITY.md`, vi du:
   - `bug bounty`
   - `responsible disclosure`
   - `security policy`
   - `security@example.com`
   - URL toi Immunefi, HackerOne, Cantina, Code4rena, Bugcrowd, HackenProof

## Stack

- Next.js 16 + TypeScript
- PostgreSQL + Prisma
- Dashboard auth bang `MANAGEMENT_KEY`
- Docker Compose cho `app`, `db`, `scheduler`

## Local setup

1. Copy `app/.env.example` thanh `app/.env`, sau do cap nhat cac gia tri bat buoc nhu `MANAGEMENT_KEY` va `SESSION_SECRET`.
2. Chay migration lan dau:

```bash
npm install
npm run db:generate
npm run db:migrate -- --name init
```

3. Chay local dev server:

```bash
npm run dev
```

4. Mo `http://localhost:3000`, dang nhap bang `MANAGEMENT_KEY`.
5. `GITHUB_*` trong `.env` duoc dung nhu mac dinh backend cho web3 queries. Neu can tang API limit, co the them GitHub token truc tiep tren dashboard.

## Docker Compose

1. Copy `app/.env.example` thanh `app/.env`.
2. Neu can, cap nhat `MANAGEMENT_KEY`, `SESSION_SECRET` va `GITHUB_TOKEN` trong `app/.env`.
3. Chay toan bo stack:

```bash
docker compose up --build
```

Service `scheduler` se goi `POST /api/sync?source=schedule` theo chu ky `INGEST_INTERVAL_MINUTES`.
Moi lan sync, `app` se doc GitHub token runtime tu bang `AppSettings`, nen khong can restart container sau khi cap nhat token trong dashboard.

## Useful commands

```bash
npm run lint
npm run typecheck
npm run test
npm run sync:once
```

## Notes

- `GITHUB_TOKEN` rat nen duoc cau hinh. Khong co token, GitHub Search va contents API se bi rate limit rat nhanh.
- Moi search query duoc bo sung cac qualifier on dinh truoc khi goi GitHub Search API: `fork:false`, `archived:false`, `is:public`, `mirror:false`, `stars:>=5`, va `pushed:>=...` neu chua duoc khai bao san.
- Token GitHub duoc ma hoa truoc khi luu vao database bang secret cua ung dung.
- Dashboard hien thi ten repo, URL repo, type, security evidence va report status. Notes cho tung repo duoc luu trong database.
