import { getCategories, getProducts } from "@/lib/api";

export default async function Home() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="mb-10">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.3em] text-orange-400">
            Restaurante & Fast Food
          </p>

          <h1 className="text-4xl font-bold sm:text-5xl">
            KUCHI&apos;S
          </h1>

          <p className="mt-4 max-w-xl text-zinc-400">
            Explora nuestra carta y encuentra tu próxima favorita.
          </p>
        </header>

        <section className="mb-10">
          <div className="flex gap-3 overflow-x-auto pb-3">
            {categories.map((category) => (
              <button
                key={category.id}
                className="shrink-0 rounded-full border border-zinc-700 px-5 py-2 text-sm transition hover:border-orange-400 hover:text-orange-400"
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex min-h-52 items-center justify-center">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-48 w-full object-contain"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
                    Sin imagen
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-semibold">
                    {product.name}
                  </h2>

                  <span className="shrink-0 font-semibold text-orange-400">
                    S/ {Number(product.price).toFixed(2)}
                  </span>
                </div>

                {product.description && (
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {product.description}
                  </p>
                )}

                <button
                  disabled={!product.is_available}
                  className="mt-5 w-full rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {product.is_available
                    ? "Agregar"
                    : "No disponible"}
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}