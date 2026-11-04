# Citylab 0.2 reference study

Read before rebuilding: CityWorks main cb6d077, README and three-island integration data/shared-court contracts; Metroforge metroforge-urban-v08/ARCHITECTURE.md and src/urban-fabric.js (blob 96108d105bc7e3a38a38c64c30899b80354b801b); mrdoob/slop-newyork js/buildings.js (blob cf6d96b8139eacefd1846c671304145d7ada2150) and js/tsl-materials.js (blob 4ec2fcaa56c90c39d27f4f58e984d0fb2da1a058).

Applied: reserve courts and access before infill; spatially coherent districts rather than random palettes; inward-only architectural footprints; full-bay facade lattices; derivative-filtered shader openings; disjoint ground surface ownership before depth bias. The new WebGL compiler is original, not a copied TSL renderer. Private Metroforge code remains private. No surveyed Manhattan geometry is included. Reference repositories are unchanged.

36 blocks, six six-block districts, variable street spacing/widths and 47 upper connections. Ground intersections have one owner, bridge ends have exact butt joints, facades use one shell rather than layered window cuboids, and fan blades are not duplicated at 180 degrees.

This remains an orthogonal district grammar, not a port of CityWorks' full street graph. AABB collision is approximate on tapered masses. Surface audits cover registered ground/deck surfaces and building/road exclusions, not all possible triangle pairs. No commercial-art parity, VR performance, streaming, interiors, or full game claim.
