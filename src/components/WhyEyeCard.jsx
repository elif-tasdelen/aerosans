import { useState } from 'react';
import { OSD397 } from '../data/osd397_genes.js';
import { OSD397_VOLCANO_CAPTION, SCIENCE_NOTES } from '../config.js';

const VOLCANO_SRC = `${import.meta.env.BASE_URL}osd397_volcano.png`;

function GeneTable({ title, genes, tone }) {
  return (
    <div className="gene-table">
      <div className={`label gene-${tone}`}>{title}</div>
      <table>
        <thead>
          <tr>
            <th>Gene</th>
            <th>log2 FC</th>
            <th>adj. p</th>
          </tr>
        </thead>
        <tbody>
          {genes.map((g) => (
            <tr key={g.gene}>
              <td>
                <em>{g.gene}</em>
              </td>
              <td>{g.log2fc > 0 ? '+' : ''}{g.log2fc.toFixed(2)}</td>
              <td>{g.padj < 0.001 ? g.padj.toExponential(1) : g.padj.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Why the eye?" — the SANS background, OSD-397 mouse-retina genes and the volcano plot. */
export default function WhyEyeCard() {
  const [imageOk, setImageOk] = useState(true);

  return (
    <section className="card why-card">
      <h2>Why the eye?</h2>
      <p>{SCIENCE_NOTES.whyEye}</p>

      <div className="why-layout">
        <div>
          <h3>Spaceflight and the retina (mouse data)</h3>
          <p className="small">
            {OSD397.source}: <strong>{OSD397.significantCount}</strong> genes changed significantly
            ({OSD397.comparison}, adjusted p &lt; 0.05). Examples:
          </p>
          <div className="gene-tables">
            <GeneTable title="Higher in spaceflight" genes={OSD397.up} tone="up" />
            <GeneTable title="Lower in spaceflight" genes={OSD397.down} tone="down" />
          </div>
          <p className="small muted">{OSD397.excludedNote}</p>
          <p className="small muted">{OSD397.caveat}</p>
          <p className="small">
            Data:{' '}
            <a href={OSD397.url} target="_blank" rel="noreferrer">
              NASA OSDR OSD-397
            </a>{' '}
            · Background:{' '}
            <a href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noreferrer">
              NASA HRP 5 Hazards
            </a>
            ,{' '}
            <a href="https://www.nasa.gov/hrp/risks/" target="_blank" rel="noreferrer">
              Risks of Human Spaceflight
            </a>
          </p>
        </div>

        {imageOk && (
          <figure className="volcano">
            <img src={VOLCANO_SRC} alt="Volcano plot of OSD-397 mouse retina gene expression" onError={() => setImageOk(false)} />
            <figcaption className="small muted">{OSD397_VOLCANO_CAPTION}</figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
