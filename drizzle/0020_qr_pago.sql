-- El QR interoperable de Bre-B que el cliente guarda y escanea desde la app de su banco.
-- Vive en el bucket público `productos` (bajo `tienda/`) y no en el repo, para poder
-- cambiarlo desde /admin/ajustes sin desplegar.
--
-- `nequi_numero` y `nequi_titular` NO se tocan: el checkout deja de mostrarlos, pero se
-- conservan escritos por si hubiera que volver al pago por número.
ALTER TABLE "store" ADD COLUMN "nequi_qr_url" text;
