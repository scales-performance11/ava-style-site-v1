import { getPublishedLandingPhotos } from "../lib/landingPhotos";

export const dynamic = "force-dynamic";

const visualWorld = [
  "Elevated Casual",
  "Gym Luxury",
  "Night / Editorial",
  "California Coastal",
  "Jewelry & Layers",
  "Styled Under $100",
];

const galleryTiles = [
  {
    title: "Texture",
    note: "Cream, black, silver, skin, shine.",
  },
  {
    title: "Instinct",
    note: "Layered without looking planned.",
  },
  {
    title: "Presence",
    note: "The piece matters less than the way it is worn.",
  },
];

export default async function Home() {
  const landingPhotos = await getPublishedLandingPhotos();

  return (
    <main>
      <section className="hero" aria-label="Ava editorial landing page hero">
        <img
          className="heroImage"
          src={landingPhotos.portrait.src}
          alt={landingPhotos.portrait.alt}
        />
        <div className="heroVeil" />
        <div className="chromeLine chromeLineTop" />
        <div className="chromeLine chromeLineBottom" />

        <div className="heroContent">
          <p className="eyebrow">Personal style editorial</p>
          <h1>AVA</h1>
          <p className="tagline">Luxury is how you wear it.</p>
          <p className="supporting">
            Styled with instinct. Designer energy without designer rules.
          </p>
        </div>
      </section>

      <section className="identity sectionPad">
        <div className="sectionNumber">01</div>
        <div className="identityCopy">
          <p>Style isn&apos;t about labels.</p>
          <p>
            It&apos;s about instinct — the way pieces are chosen, layered, and
            worn.
          </p>
        </div>
      </section>

      <section className="visualWorld sectionPad">
        <div className="sectionIntro">
          <p className="eyebrow dark">Visual world</p>
          <h2>Clothes with a point of view.</h2>
        </div>
        <div className="worldGrid">
          {visualWorld.map((item) => (
            <article className="worldTile" key={item}>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="philosophy">
        <div className="philosophyInner">
          <p>
            Anyone can wear expensive things.
            <br />
            Ava knows how to make everyday pieces feel unforgettable.
          </p>
        </div>
      </section>

      <section className="gallery sectionPad">
        <div className="sectionIntro">
          <p className="eyebrow dark">Gallery preview</p>
          <h2>A soft archive of what comes next.</h2>
        </div>
        <div className="galleryGrid">
          <figure className="featureFrame">
            <img src={landingPhotos["main-brand"].src} alt={landingPhotos["main-brand"].alt} />
          </figure>
          {galleryTiles.map((tile) => (
            <article className="galleryPlaceholder" key={tile.title}>
              <p>{tile.title}</p>
              <span>{tile.note}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="closing">
        <div className="closingInner">
          <p>Ava&apos;s world is coming.</p>
          <a href="/admin">Admin</a>
        </div>
      </section>
    </main>
  );
}
