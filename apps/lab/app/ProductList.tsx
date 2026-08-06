import { ArrowRight } from "lucide-react";

import { Button, Reveal, rowDelay } from "@seri/ui";

export type Product = { name: string; href: string; body: string };

/*
 * A list, not a one-off block. The lab has one product today and its neutrality criterion is
 * that the section takes a second without a rewrite — a component tests/copy.test.ts can render
 * with two fixture entries is what makes that checkable, rather than asserting a Tailwind class
 * and calling it structural.
 *
 * The id is how tests/copy.test.ts tells this list apart from the two other grids in the
 * rendered page: it cuts this one out and then asserts that nothing left names a product.
 * Remove it and that file's structural test goes red.
 */
export function ProductList({ products }: { products: Product[] }) {
  return (
    <ul id="products" className="mt-29 grid gap-8 md:mt-34 md:grid-cols-2 md:gap-11">
      {products.map((product, index) => (
        <Reveal
          key={product.name}
          as="li"
          delay={rowDelay(index, 2)}
          className="flex h-full flex-col rounded-md border border-ink-hairline bg-canvas p-16 shadow-card md:p-22"
        >
          <code className="font-mono text-mono font-bold">{product.name}</code>
          <p className="mt-11 text-ink-subtle">{product.body}</p>
          <div className="mt-16 flex">
            <Button asChild variant="outline" size="sm">
              <a href={product.href}>
                Open
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            </Button>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}
