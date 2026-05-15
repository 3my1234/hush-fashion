# Hush Fashion Web App

Client + Admin web/mobile-responsive app for a fashion brand.

## Features

- Client storefront with male/female outfit catalog (image, price, color, sizes, description).
- Client order placement with contact details and address.
- Admin dashboard showing all orders and customer details.
- Admin order status updates (`new`, `contacted`, `fulfilled`, `cancelled`).
- Per-order chat thread between client and admin.
- Message attachment support (plain URL or `s3://` object key).
- S3 presigned upload endpoint for secure file uploads.

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

Open:

- Client: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

## S3 Attachment Flow

1. Call `POST /api/uploads/presign` with:
```json
{ "fileName": "design.jpg", "contentType": "image/jpeg" }
```
2. Upload file directly to returned `uploadUrl` with `PUT`.
3. Save returned `persistentUrl` (looks like `s3://attachments/...`) as `attachment_url` in message creation.
4. When messages are fetched, backend resolves `s3://` URLs to temporary signed download URLs.

## Key API Endpoints

- `GET /api/products?category=male|female`
- `POST /api/orders`
- `GET /api/orders`
- `PATCH /api/orders/:orderId/status`
- `GET /api/orders/:orderId/messages`
- `POST /api/orders/:orderId/messages`
- `POST /api/uploads/presign`

## Notes

- SQLite DB is created at `db/hush.db`.
- Seed products are inserted automatically on first run.
- Replace seed product images/details from DB or by adding a product management route.
