import type { StorefrontBlock } from "@daedalus/shared";
import "./BlockRenderer.scss";

/** Renders the Challenger-phase block sequence as semantic sections. */
export function BlockRenderer({ blocks }: { blocks: StorefrontBlock[] }) {
  return (
    <>
      {blocks.map((b) => (
        <section key={b.id} className={`block block-${b.type}`} data-block-type={b.type}>
          <div className="block-inner">
            <h2 className="block-headline">{b.headline}</h2>
            <p className="block-body">{b.body}</p>
          </div>
        </section>
      ))}
    </>
  );
}
