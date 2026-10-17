import Image from "next/image";
import type { MediaAsset, StorefrontBlock } from "@daedalus/shared";
import "./BlockRenderer.scss";

/** Renders the Challenger-phase block sequence as semantic sections. */
export function BlockRenderer({
  blocks,
  media,
}: {
  blocks: StorefrontBlock[];
  media: Map<string, MediaAsset & { id: string }>;
}) {
  return (
    <>
      {blocks.map((b) => {
        const asset = b.mediaAssetIds.length
          ? media.get(b.mediaAssetIds[0])
          : undefined;
        return (
          <section key={b.id} className={`block block-${b.type}`} data-block-type={b.type}>
            <div className="block-inner">
              {asset && (
                <figure className="block-media">
                  <Image
                    src={asset.publicUrl}
                    alt={asset.altText || b.headline}
                    width={1200}
                    height={675}
                  />
                </figure>
              )}
              <h2 className="block-headline">{b.headline}</h2>
              <p className="block-body">{b.body}</p>
            </div>
          </section>
        );
      })}
    </>
  );
}
