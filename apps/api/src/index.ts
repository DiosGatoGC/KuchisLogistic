import app from "./app";
import { env } from "./config/env";

// Vercel utiliza la instancia de Express directamente.
export default app;

// En desarrollo local sí levantamos el servidor manualmente.
if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(
      `KUCHI'S API running on http://localhost:${env.PORT}`
    );
  });
}
