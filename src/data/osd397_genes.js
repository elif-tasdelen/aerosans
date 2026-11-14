// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

// NASA OSDR OSD-397 — Rodent Research-1, spaceflight vs ground control mouse retina (RNA-seq).
// Comparison: (Space Flight)v(Ground Control); significance: adjusted p-value < 0.05.
export const OSD397 = {
  source: 'NASA OSDR OSD-397 (Rodent Research-1, mouse retina)',
  url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-397',
  comparison: 'Space Flight vs Ground Control',
  significantCount: 73,
  up: [{ gene: 'Upk3b', log2fc: 1.27, padj: 7.25e-3 }],
  down: [
    { gene: 'Cers3', log2fc: -2.62, padj: 1.8e-3 },
    { gene: 'AA413626', log2fc: -1.66, padj: 0.0454 },
  ],
  excludedNote:
    'Two genes with extreme fold changes (Pde2a, Atp6-ps) were excluded as likely low-count artifacts.',
  caveat: 'Mouse data from a 37-day mission; not directly transferable to humans.',
};
